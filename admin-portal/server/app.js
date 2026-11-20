import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  hasPermission,
  isRecentAuth,
  PERMISSIONS,
  resolveEffectivePermissions,
  resolveEffectiveRole,
} from './rbac.js';
import {
  AuditLogSchema,
  BACKUP_COLLECTIONS,
  BackupPayloadSchema,
  DeleteUserSchema,
  GrantAdminSchema,
  RevokeAdminSchema,
  UpdateUserStatusSchema,
} from './validators.js';
import { createApiRateLimiter, createSensitiveRateLimiter } from './rateLimit.js';

function serializeFirestoreValue(val) {
  if (val instanceof Timestamp) {
    return { __type: 'Timestamp', seconds: val.seconds, nanoseconds: val.nanoseconds };
  }
  if (Array.isArray(val)) return val.map(serializeFirestoreValue);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }
  return val;
}

function deserializeFirestoreValue(val) {
  if (Array.isArray(val)) return val.map(deserializeFirestoreValue);
  if (val && typeof val === 'object') {
    if (val.__type === 'Timestamp' && typeof val.seconds === 'number') {
      return new Timestamp(val.seconds, Number(val.nanoseconds || 0));
    }
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = deserializeFirestoreValue(v);
    }
    return out;
  }
  return val;
}

export function createAdminApp({ config, firebaseServices }) {
  const { auth, db, appCheck } = firebaseServices;
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('ORIGIN_NOT_ALLOWED'));
        }
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', createApiRateLimiter());

  const sensitiveLimiter = createSensitiveRateLimiter();

  async function writeAudit({ actorUid, actorEmail, actorRole, action, entityType, entityId = '', summary = '' }) {
    try {
      await db.collection('auditLogs').add({
        actorUid,
        actorEmail: actorEmail || '',
        actorRole,
        action,
        entityType,
        entityId,
        summary: summary.slice(0, 500),
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to write audit log:', err?.message || err);
    }
  }

  async function verifyStaff(req, res, next) {
    try {
      if (config.enforceAppCheck) {
        const appCheckToken = req.header('X-Firebase-AppCheck');
        if (!appCheckToken) {
          return res.status(401).json({ error: 'APP_CHECK_MISSING', message: 'رمز التحقق من التطبيق مفقود.' });
        }
        await appCheck.verifyToken(appCheckToken);
      }

      const authHeader = req.header('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'يرجى تسجيل الدخول أولاً.' });
      }

      const decoded = await auth.verifyIdToken(token, true);
      const adminSnap = await db.collection('admins').doc(decoded.uid).get();
      const adminDoc = adminSnap.exists ? adminSnap.data() : null;

      const role = resolveEffectiveRole(decoded, adminDoc, config.superAdminEmail);
      if (role === 'STUDENT') {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'هذا الحساب لا يملك صلاحية الدخول إلى لوحة التحكم الإدارية.',
        });
      }

      // Ensure bootstrapped Super Admin also holds custom claim + admins doc
      if (role === 'SUPER_ADMIN' && (!decoded.abkRole || decoded.abkRole !== 'SUPER_ADMIN')) {
        await auth.setCustomUserClaims(decoded.uid, {
          abkRole: 'SUPER_ADMIN',
          abkPermissions: resolveEffectivePermissions('SUPER_ADMIN', decoded, adminDoc),
        });
        if (!adminSnap.exists) {
          await db.collection('admins').doc(decoded.uid).set({
            uid: decoded.uid,
            email: decoded.email || config.superAdminEmail,
            displayName: decoded.name || 'المدير العام',
            role: 'SUPER_ADMIN',
            permissions: resolveEffectivePermissions('SUPER_ADMIN', decoded, adminDoc),
            active: true,
            grantedBy: 'SYSTEM_BOOTSTRAP',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      req.staff = {
        uid: decoded.uid,
        email: decoded.email || '',
        name: decoded.name || '',
        mfaEnrolled: Array.isArray(decoded.firebase?.sign_in_second_factor) || Boolean(decoded.firebase?.sign_in_second_factor),
        authTime: Number(decoded.auth_time || 0),
        decoded,
        role,
        permissions: resolveEffectivePermissions(role, decoded, adminDoc),
        teacherId: adminDoc?.teacherId || null,
      };
      next();
    } catch (err) {
      const code = err?.code || '';
      if (code.includes('id-token-revoked') || code.includes('id-token-expired')) {
        return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'انتهت جلسة العمل، يرجى إعادة تسجيل الدخول.' });
      }
      console.error('Staff auth verification error:', err?.message || err);
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'فشل التحقق من هوية المشرف.' });
    }
  }

  function requirePerm(permission) {
    return (req, res, next) => {
      if (!hasPermission(req.staff, permission)) {
        return res.status(403).json({
          error: 'INSUFFICIENT_PERMISSION',
          message: `لا تملك الصلاحية المطلوبة: ${permission}`,
        });
      }
      next();
    };
  }

  function requireRecentReauth(req, res, next) {
    if (!isRecentAuth(req.staff.decoded, config.sensitiveAuthMaxAgeSeconds)) {
      return res.status(428).json({
        error: 'REAUTH_REQUIRED',
        message: 'هذه العملية الحساسة تتطلب إعادة توثيق الجلسة حديثاً.',
      });
    }
    next();
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'abk-admin-backend',
      projectId: config.projectId,
      databaseId: config.databaseId,
      appCheckEnforced: config.enforceAppCheck,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/auth/me', verifyStaff, (req, res) => {
    res.json({
      uid: req.staff.uid,
      email: req.staff.email,
      name: req.staff.name,
      role: req.staff.role,
      permissions: req.staff.permissions,
      teacherId: req.staff.teacherId,
      authTime: req.staff.authTime,
      mfaVerified: Boolean(req.staff.decoded?.firebase?.sign_in_second_factor),
    });
  });

  app.get('/api/admins', verifyStaff, requirePerm(PERMISSIONS.MANAGE_ADMINS), async (_req, res) => {
    const snap = await db.collection('admins').get();
    const admins = snap.docs.map((d) => ({ id: d.id, ...serializeFirestoreValue(d.data()) }));
    res.json({ admins });
  });

  app.post(
    '/api/admins/grant',
    sensitiveLimiter,
    verifyStaff,
    requirePerm(PERMISSIONS.MANAGE_ADMINS),
    requireRecentReauth,
    async (req, res) => {
      const parsed = GrantAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const { email, role, permissions, teacherId, active } = parsed.data;
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(email);
      } catch {
        return res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'لم يتم العثور على مستخدم مسجل بهذا البريد الإلكتروني. يجب أن يسجل دخوله بالحساب أولاً.',
        });
      }

      const effectivePerms = resolveEffectivePermissions(role, null, { permissions });
      await auth.setCustomUserClaims(userRecord.uid, {
        abkRole: active ? role : 'STUDENT',
        abkPermissions: active ? effectivePerms : [],
      });

      const docRef = db.collection('admins').doc(userRecord.uid);
      const existingSnap = await docRef.get();
      await docRef.set(
        {
          uid: userRecord.uid,
          email: userRecord.email || email,
          displayName: userRecord.displayName || email,
          role,
          permissions: effectivePerms,
          teacherId: teacherId || '',
          active,
          grantedBy: req.staff.email || req.staff.uid,
          createdAt: existingSnap.exists ? existingSnap.data().createdAt : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Sync user profile role label for visibility
      const userProfileRef = db.collection('users').doc(userRecord.uid);
      const userSnap = await userProfileRef.get();
      if (userSnap.exists) {
        await userProfileRef.update({
          role: active ? role : 'STUDENT',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await writeAudit({
        actorUid: req.staff.uid,
        actorEmail: req.staff.email,
        actorRole: req.staff.role,
        action: 'GRANT_STAFF_ROLE',
        entityType: 'AdminEntry',
        entityId: userRecord.uid,
        summary: `تعيين ${email} بدور ${role} (${active ? 'نشط' : 'معطل'})`,
      });

      res.json({ ok: true, uid: userRecord.uid, role, permissions: effectivePerms });
    }
  );

  app.post(
    '/api/admins/revoke',
    sensitiveLimiter,
    verifyStaff,
    requirePerm(PERMISSIONS.MANAGE_ADMINS),
    requireRecentReauth,
    async (req, res) => {
      const parsed = RevokeAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const { uid } = parsed.data;
      if (uid === req.staff.uid) {
        return res.status(400).json({ error: 'SELF_REVOKE_DENIED', message: 'لا يمكنك سحب صلاحياتك بنفسك.' });
      }

      const targetUser = await auth.getUser(uid).catch(() => null);
      if (targetUser?.email?.toLowerCase() === config.superAdminEmail) {
        return res.status(403).json({
          error: 'PRIMARY_SUPER_ADMIN_LOCKED',
          message: 'لا يمكن سحب صلاحيات حساب المدير العام الأساسي.',
        });
      }

      await auth.setCustomUserClaims(uid, { abkRole: 'STUDENT', abkPermissions: [] });
      await db.collection('admins').doc(uid).delete();
      const userProfileRef = db.collection('users').doc(uid);
      if ((await userProfileRef.get()).exists) {
        await userProfileRef.update({ role: 'STUDENT', updatedAt: FieldValue.serverTimestamp() });
      }

      await writeAudit({
        actorUid: req.staff.uid,
        actorEmail: req.staff.email,
        actorRole: req.staff.role,
        action: 'REVOKE_STAFF_ROLE',
        entityType: 'AdminEntry',
        entityId: uid,
        summary: `سحب الصلاحيات الإدارية من ${targetUser?.email || uid}`,
      });

      res.json({ ok: true });
    }
  );

  const UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

  async function deleteSubcollectionDocs(docRef, subName) {
    if (typeof docRef.collection !== 'function') return;
    const subSnap = await docRef.collection(subName).get();
    if (!subSnap || !Array.isArray(subSnap.docs) || subSnap.docs.length === 0) return;
    for (let i = 0; i < subSnap.docs.length; i += 400) {
      const batch = db.batch();
      for (const d of subSnap.docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  }

  app.get('/api/users', verifyStaff, requirePerm(PERMISSIONS.MANAGE_USERS), async (_req, res) => {
    const authUsers = [];
    let pageToken;
    for (let page = 0; page < 5; page++) {
      const listResult = await auth.listUsers(1000, pageToken);
      for (const u of listResult.users || []) {
        authUsers.push(u);
      }
      if (!listResult.pageToken) break;
      pageToken = listResult.pageToken;
    }

    const [usersSnap, adminsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('admins').get(),
    ]);

    const profileMap = new Map();
    for (const d of usersSnap.docs || []) {
      profileMap.set(d.id, serializeFirestoreValue(d.data()));
    }
    const adminMap = new Map();
    for (const d of adminsSnap.docs || []) {
      adminMap.set(d.id, serializeFirestoreValue(d.data()));
    }

    const mergedMap = new Map();
    for (const u of authUsers) {
      const profile = profileMap.get(u.uid) || null;
      const adminDoc = adminMap.get(u.uid) || null;
      const claimsRole = u.customClaims?.abkRole;
      const effectiveRole =
        claimsRole ||
        (adminDoc && adminDoc.active !== false ? adminDoc.role || 'ADMIN' : null) ||
        profile?.role ||
        'STUDENT';

      const rawStatus = profile?.accountStatus;
      const accountStatus =
        rawStatus === 'BANNED'
          ? 'BANNED'
          : rawStatus === 'SUSPENDED' || u.disabled
            ? 'SUSPENDED'
            : 'ACTIVE';

      mergedMap.set(u.uid, {
        uid: u.uid,
        email: u.email || profile?.email || '',
        displayName: u.displayName || profile?.displayName || u.email || 'مستخدم ABK',
        photoUrl: u.photoURL || profile?.photoUrl || null,
        disabled: Boolean(u.disabled),
        emailVerified: Boolean(u.emailVerified),
        creationTime: u.metadata?.creationTime || null,
        lastSignInTime: u.metadata?.lastSignInTime || null,
        providerIds: Array.isArray(u.providerData) ? u.providerData.map((p) => p.providerId).filter(Boolean) : [],
        role: effectiveRole,
        accountStatus,
        banReason: profile?.banReason || null,
        bannedAt: profile?.bannedAt || null,
        bannedBy: profile?.bannedBy || null,
        lastActiveAt: profile?.lastActiveAt || null,
        createdAt: profile?.createdAt || null,
        hasFirestoreProfile: Boolean(profile),
        authPresent: true,
      });
    }

    // Include any orphaned Firestore-only profiles for visibility/cleanup
    for (const [uid, profile] of profileMap.entries()) {
      if (mergedMap.has(uid)) continue;
      mergedMap.set(uid, {
        uid,
        email: profile?.email || '',
        displayName: profile?.displayName || profile?.email || 'مستخدم ABK',
        photoUrl: profile?.photoUrl || null,
        disabled: profile?.accountStatus === 'SUSPENDED' || profile?.accountStatus === 'BANNED',
        emailVerified: false,
        creationTime: null,
        lastSignInTime: null,
        providerIds: [],
        role: profile?.role || 'STUDENT',
        accountStatus:
          profile?.accountStatus === 'BANNED'
            ? 'BANNED'
            : profile?.accountStatus === 'SUSPENDED'
              ? 'SUSPENDED'
              : 'ACTIVE',
        banReason: profile?.banReason || null,
        bannedAt: profile?.bannedAt || null,
        bannedBy: profile?.bannedBy || null,
        lastActiveAt: profile?.lastActiveAt || null,
        createdAt: profile?.createdAt || null,
        hasFirestoreProfile: true,
        authPresent: false,
      });
    }

    const users = Array.from(mergedMap.values()).sort((a, b) => {
      const ta = a.lastSignInTime ? Date.parse(a.lastSignInTime) : 0;
      const tb = b.lastSignInTime ? Date.parse(b.lastSignInTime) : 0;
      return tb - ta;
    });

    res.json({ users });
  });

  app.patch(
    '/api/users/:uid/status',
    sensitiveLimiter,
    verifyStaff,
    requirePerm(PERMISSIONS.MANAGE_USERS),
    async (req, res) => {
      const { uid } = req.params;
      if (!UID_PATTERN.test(uid)) {
        return res.status(400).json({ error: 'INVALID_UID', message: 'معرف المستخدم غير صالح.' });
      }
      const parsed = UpdateUserStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      if (uid === req.staff.uid) {
        return res.status(400).json({ error: 'SELF_SUSPEND_DENIED', message: 'لا يمكنك تعطيل أو حظر حسابك الحالي.' });
      }

      const targetAuth = await auth.getUser(uid).catch(() => null);
      const userRef = db.collection('users').doc(uid);
      const existingSnap = await userRef.get();
      const existingData = existingSnap.exists ? existingSnap.data() : null;
      const targetEmail = (targetAuth?.email || existingData?.email || '').toLowerCase();

      if (targetEmail && targetEmail === config.superAdminEmail) {
        return res.status(403).json({
          error: 'PRIMARY_SUPER_ADMIN_LOCKED',
          message: 'لا يمكن تعطيل أو حظر حساب المدير العام الأساسي.',
        });
      }
      if (!targetAuth && !existingSnap.exists) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'لم يتم العثور على الحساب المطلوب.' });
      }

      const { accountStatus, reason } = parsed.data;
      const shouldDisable = accountStatus === 'SUSPENDED' || accountStatus === 'BANNED';
      if (targetAuth) {
        await auth.updateUser(uid, { disabled: shouldDisable });
        if (shouldDisable && typeof auth.revokeRefreshTokens === 'function') {
          await auth.revokeRefreshTokens(uid);
        }
      }

      const nowFields = {
        accountStatus,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (accountStatus === 'BANNED') {
        nowFields.banReason = reason || 'مخالفة شروط استخدام المنصة';
        nowFields.bannedAt = FieldValue.serverTimestamp();
        nowFields.bannedBy = req.staff.email || req.staff.uid;
      } else {
        nowFields.banReason = FieldValue.delete();
        nowFields.bannedAt = FieldValue.delete();
        nowFields.bannedBy = FieldValue.delete();
      }

      if (existingSnap.exists) {
        await userRef.update(nowFields);
      } else {
        await userRef.set({
          userId: uid,
          displayName: targetAuth?.displayName || targetAuth?.email || 'طالب ABK',
          email: targetAuth?.email || '',
          ...(targetAuth?.photoURL ? { photoUrl: targetAuth.photoURL } : {}),
          role: 'STUDENT',
          createdAt: FieldValue.serverTimestamp(),
          ...nowFields,
        });
      }

      const wasBanned = existingData?.accountStatus === 'BANNED';
      const auditAction =
        accountStatus === 'BANNED'
          ? 'BAN_USER'
          : accountStatus === 'SUSPENDED'
            ? 'SUSPEND_USER'
            : wasBanned
              ? 'UNBAN_USER'
              : 'ACTIVATE_USER';

      await writeAudit({
        actorUid: req.staff.uid,
        actorEmail: req.staff.email,
        actorRole: req.staff.role,
        action: auditAction,
        entityType: 'UserProfile',
        entityId: uid,
        summary: `تغيير حالة الحساب ${targetEmail || uid} إلى ${accountStatus}${reason ? ` (${reason})` : ''}`,
      });

      res.json({
        ok: true,
        uid,
        accountStatus,
        disabled: shouldDisable,
        revokedTokens: shouldDisable,
      });
    }
  );

  app.delete(
    '/api/users/:uid',
    sensitiveLimiter,
    verifyStaff,
    requirePerm(PERMISSIONS.MANAGE_USERS),
    requireRecentReauth,
    async (req, res) => {
      const { uid } = req.params;
      if (!UID_PATTERN.test(uid)) {
        return res.status(400).json({ error: 'INVALID_UID', message: 'معرف المستخدم غير صالح.' });
      }
      if (uid === req.staff.uid) {
        return res.status(400).json({ error: 'SELF_DELETE_DENIED', message: 'لا يمكنك حذف حسابك الحالي.' });
      }

      const parsed = DeleteUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'يجب إرسال تأكيد الحذف (البريد الإلكتروني أو UID).' });
      }

      const targetAuth = await auth.getUser(uid).catch(() => null);
      const userRef = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      const targetData = userSnap.exists ? userSnap.data() : null;

      if (!targetAuth && !userSnap.exists) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود.' });
      }

      const targetEmail = (targetAuth?.email || targetData?.email || '').trim();
      if (targetEmail.toLowerCase() === config.superAdminEmail) {
        return res.status(403).json({
          error: 'PRIMARY_SUPER_ADMIN_LOCKED',
          message: 'لا يمكن حذف حساب المدير العام الأساسي.',
        });
      }

      const confirmValue = parsed.data.confirmTarget.trim();
      const emailMatches = targetEmail && confirmValue.toLowerCase() === targetEmail.toLowerCase();
      const uidMatches = confirmValue === uid;
      if (!emailMatches && !uidMatches) {
        return res.status(400).json({
          error: 'CONFIRMATION_MISMATCH',
          message: 'قيمة التأكيد لا تطابق البريد الإلكتروني أو معرف المستخدم.',
        });
      }

      // Clean up student subcollections + profile + admin doc, then remove Firebase Auth account
      await deleteSubcollectionDocs(userRef, 'favorites');
      await deleteSubcollectionDocs(userRef, 'progress');
      await deleteSubcollectionDocs(userRef, 'readAnnouncements');
      if (userSnap.exists) {
        await userRef.delete();
      }
      const adminRef = db.collection('admins').doc(uid);
      const adminSnap = await adminRef.get();
      if (adminSnap.exists) {
        await adminRef.delete();
      }
      if (targetAuth) {
        await auth.deleteUser(uid);
      }

      await writeAudit({
        actorUid: req.staff.uid,
        actorEmail: req.staff.email,
        actorRole: req.staff.role,
        action: 'DELETE_USER',
        entityType: 'UserProfile',
        entityId: uid,
        summary: `حذف المستخدم نهائياً من Auth وFirestore (${targetEmail || uid})`,
      });

      res.json({ ok: true, uid, deletedEmail: targetEmail || null });
    }
  );

  app.post('/api/audit/log', verifyStaff, async (req, res) => {
    const parsed = AuditLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    await writeAudit({
      actorUid: req.staff.uid,
      actorEmail: req.staff.email,
      actorRole: req.staff.role,
      ...parsed.data,
    });
    res.json({ ok: true });
  });

  app.get(
    '/api/backups/export',
    sensitiveLimiter,
    verifyStaff,
    requirePerm(PERMISSIONS.MANAGE_BACKUPS),
    async (req, res) => {
      const collections = {};
      const counts = {};

      for (const name of BACKUP_COLLECTIONS) {
        const snap = await db.collection(name).get();
        collections[name] = snap.docs.map((doc) => ({
          id: doc.id,
          data: serializeFirestoreValue(doc.data()),
        }));
        counts[name] = snap.size;
      }

      await db.collection('backups').add({
        label: `نسخة احتياطية ${new Date().toISOString()}`,
        createdByUid: req.staff.uid,
        createdByEmail: req.staff.email,
        documentCounts: counts,
        createdAt: FieldValue.serverTimestamp(),
      });

      await writeAudit({
        actorUid: req.staff.uid,
        actorEmail: req.staff.email,
        actorRole: req.staff.role,
        action: 'EXPORT_BACKUP',
        entityType: 'BackupSnapshot',
        summary: `تصدير نسخة احتياطية كاملة (${Object.values(counts).reduce((a, b) => a + b, 0)} سجل)`,
      });

      res.json({
        version: 'abk-backup-v1',
        exportedAt: new Date().toISOString(),
        databaseId: config.databaseId,
        collections,
      });
    }
  );

  app.post(
    '/api/backups/restore',
    sensitiveLimiter,
    verifyStaff,
    requirePerm(PERMISSIONS.MANAGE_BACKUPS),
    requireRecentReauth,
    async (req, res) => {
      const parsed = BackupPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'INVALID_BACKUP_FILE', details: parsed.error.flatten() });
      }

      const { collections } = parsed.data;
      let restoredCount = 0;

      for (const [colName, docs] of Object.entries(collections)) {
        if (!BACKUP_COLLECTIONS.includes(colName) || !Array.isArray(docs)) continue;
        // Commit in Firestore batches of 400
        for (let i = 0; i < docs.length; i += 400) {
          const chunk = docs.slice(i, i + 400);
          const batch = db.batch();
          for (const item of chunk) {
            const ref = db.collection(colName).doc(item.id);
            batch.set(ref, deserializeFirestoreValue(item.data), { merge: true });
            restoredCount++;
          }
          await batch.commit();
        }
      }

      await writeAudit({
        actorUid: req.staff.uid,
        actorEmail: req.staff.email,
        actorRole: req.staff.role,
        action: 'RESTORE_BACKUP',
        entityType: 'BackupSnapshot',
        summary: `استعادة ${restoredCount} سجل من نسخة احتياطية`,
      });

      res.json({ ok: true, restoredCount });
    }
  );

  app.use((err, _req, res, _next) => {
    if (err?.message === 'ORIGIN_NOT_ALLOWED') {
      return res.status(403).json({ error: 'CORS_DENIED', message: 'المصدر غير مصرح له.' });
    }
    console.error('Unhandled backend error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع في الخادم.' });
  });

  return app;
}
