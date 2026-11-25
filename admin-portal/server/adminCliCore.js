import {
  normalizeIdentifierValue,
  normalizeStaffRole,
  resolveEffectivePermissions,
  STAFF_ROLES,
} from './rbac.js';

export function parseAdminCliArgs(argv) {
  const result = {
    mode: null,
    email: '',
    uid: '',
    role: 'SUPER_ADMIN',
    allowUnverified: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--verify') {
      result.mode = 'verify';
    } else if (arg === '--grant') {
      result.mode = 'grant';
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--allow-unverified') {
      result.allowUnverified = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--email' && i + 1 < argv.length) {
      result.email = String(argv[++i] || '').trim();
    } else if (arg.startsWith('--email=')) {
      result.email = arg.slice('--email='.length).trim();
    } else if (arg === '--uid' && i + 1 < argv.length) {
      result.uid = String(argv[++i] || '').trim();
    } else if (arg.startsWith('--uid=')) {
      result.uid = arg.slice('--uid='.length).trim();
    } else if (arg === '--role' && i + 1 < argv.length) {
      result.role = String(argv[++i] || '').trim().toUpperCase();
    } else if (arg.startsWith('--role=')) {
      result.role = arg.slice('--role='.length).trim().toUpperCase();
    }
  }

  return result;
}

async function resolveTargetAuthUser(auth, { email, uid }) {
  if (uid) {
    return await auth.getUser(uid);
  }
  if (email) {
    return await auth.getUserByEmail(email);
  }
  throw new Error('يجب تحديد البريد الإلكتروني (--email) أو معرف المستخدم (--uid).');
}

export async function verifyAdminAccountState({ auth, db, config, email = '', uid = '' }) {
  const userRecord = await resolveTargetAuthUser(auth, { email, uid });
  const targetUid = userRecord.uid;

  const [adminSnap, userSnap, adminsCollectionSnap] = await Promise.all([
    db.collection('admins').doc(targetUid).get(),
    db.collection('users').doc(targetUid).get(),
    db.collection('admins').get(),
  ]);

  const adminDoc = adminSnap.exists ? adminSnap.data() : null;
  const userDoc = userSnap.exists ? userSnap.data() : null;

  const customClaims = userRecord.customClaims && typeof userRecord.customClaims === 'object' ? userRecord.customClaims : {};
  const rawClaimRole = typeof customClaims.abkRole === 'string' ? customClaims.abkRole : null;
  const claimRole = normalizeStaffRole(rawClaimRole);
  const hasStaffClaim = Boolean(claimRole);
  const rawDocRole = adminDoc && typeof adminDoc.role === 'string' ? adminDoc.role : null;
  const validDocRole = normalizeStaffRole(rawDocRole);
  const uidMatchesDoc = Boolean(adminDoc && normalizeIdentifierValue(adminDoc.uid) === targetUid);
  const hasActiveAdminDoc = Boolean(adminDoc && adminDoc.active === true && uidMatchesDoc && validDocRole);
  const docRole = hasActiveAdminDoc ? validDocRole : null;
  const isAdminDocDisabled = Boolean(adminDoc && adminDoc.active === false);
  const storageReady = Boolean(claimRole && ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'TEACHER'].includes(claimRole));
  const userProfileBlocked = userDoc?.accountStatus === 'BANNED' || userDoc?.accountStatus === 'SUSPENDED';

  let activeAdminCount = 0;
  let activeSuperAdminCount = 0;
  for (const d of adminsCollectionSnap.docs || []) {
    const data = d.data() || {};
    if (data.active !== true) continue;
    if (normalizeIdentifierValue(data.uid) !== d.id) continue;
    const r = normalizeStaffRole(data.role);
    if (!r) continue;
    if (r === 'SUPER_ADMIN' || r === 'ADMIN') activeAdminCount += 1;
    if (r === 'SUPER_ADMIN') activeSuperAdminCount += 1;
  }

  const readyForFirestore = !isAdminDocDisabled && (hasStaffClaim || hasActiveAdminDoc) && !userRecord.disabled;
  const readyForStorage = !isAdminDocDisabled && storageReady && !userRecord.disabled;
  const readyForFullAdmin =
    !isAdminDocDisabled &&
    Boolean(claimRole && (claimRole === 'SUPER_ADMIN' || claimRole === 'ADMIN')) &&
    Boolean(hasActiveAdminDoc && (docRole === 'SUPER_ADMIN' || docRole === 'ADMIN')) &&
    !userRecord.disabled &&
    !userProfileBlocked;
  const normalizedRawClaimForConflict = claimRole || normalizeIdentifierValue(rawClaimRole) || null;
  const normalizedRawDocForConflict = validDocRole || normalizeIdentifierValue(rawDocRole) || null;
  const hasClaimDocConflict =
    (Boolean(normalizedRawClaimForConflict) &&
      Boolean(normalizedRawDocForConflict) &&
      normalizedRawClaimForConflict !== normalizedRawDocForConflict) ||
    (isAdminDocDisabled && Boolean(claimRole)) ||
    (hasStaffClaim !== hasActiveAdminDoc);
  const isSuperAdminReady =
    !isAdminDocDisabled &&
    claimRole === 'SUPER_ADMIN' &&
    docRole === 'SUPER_ADMIN' &&
    Boolean(adminDoc && adminDoc.active === true && uidMatchesDoc) &&
    !userRecord.disabled &&
    Boolean(userRecord.emailVerified) &&
    !userProfileBlocked;
  const emailMatchesDoc = Boolean(
    adminDoc &&
      String(adminDoc.email || '').trim().toLowerCase() ===
        String(userRecord.email || '').trim().toLowerCase()
  );

  return {
    projectId: config.projectId,
    databaseId: config.databaseId,
    uid: targetUid,
    email: userRecord.email || '',
    emailVerified: Boolean(userRecord.emailVerified),
    authDisabled: Boolean(userRecord.disabled),
    customClaims: {
      abkRole: claimRole,
      abkPermissions: Array.isArray(customClaims.abkPermissions) ? customClaims.abkPermissions : [],
    },
    adminsDoc: adminDoc
      ? {
          exists: true,
          active: adminDoc.active === true,
          role: rawDocRole,
          roleValid: Boolean(validDocRole),
          uidMatchesDoc,
          emailMatchesDoc,
          grantedBy: adminDoc.grantedBy || null,
        }
      : {
          exists: false,
          active: false,
          role: null,
          roleValid: false,
          uidMatchesDoc: false,
          emailMatchesDoc: false,
          grantedBy: null,
        },
    userProfile: userDoc
      ? {
          exists: true,
          role: userDoc.role || 'STUDENT',
          accountStatus: userDoc.accountStatus || 'ACTIVE',
        }
      : { exists: false, role: null, accountStatus: null },
    counts: {
      activeAdminCount,
      activeSuperAdminCount,
    },
    checks: {
      hasStaffClaim,
      hasActiveAdminDoc,
      hasClaimDocConflict,
      readyForFirestore,
      readyForStorage,
      readyForFullAdmin,
      isSuperAdminReady,
    },
  };
}

export async function grantAdminAccount({
  auth,
  db,
  FieldValue,
  config,
  email = '',
  uid = '',
  role = 'SUPER_ADMIN',
  allowUnverified = false,
}) {
  if (!STAFF_ROLES.includes(role)) {
    throw new Error(`دور غير صالح: ${role}. الأدوار المدعومة: ${STAFF_ROLES.join(', ')}`);
  }

  const userRecord = await resolveTargetAuthUser(auth, { email, uid });
  if (userRecord.disabled) {
    throw new Error('حساب Firebase Auth معطل حالياً (disabled=true). فعّله أولاً قبل منحه صلاحيات إدارية.');
  }
  if (!userRecord.emailVerified && !allowUnverified) {
    throw new Error('البريد الإلكتروني غير موثق في Firebase Auth (emailVerified=false). استخدم تسجيل الدخول عبر Google أو --allow-unverified عند الحاجة القصوى.');
  }

  const permissions = resolveEffectivePermissions(role, null, null);
  const existingClaims = userRecord.customClaims && typeof userRecord.customClaims === 'object' ? userRecord.customClaims : {};

  await auth.setCustomUserClaims(userRecord.uid, {
    ...existingClaims,
    abkRole: role,
    abkPermissions: permissions,
  });

  const adminRef = db.collection('admins').doc(userRecord.uid);
  const existingAdminSnap = await adminRef.get();
  await adminRef.set(
    {
      uid: userRecord.uid,
      email: userRecord.email || email,
      displayName: userRecord.displayName || userRecord.email || email,
      role,
      permissions,
      teacherId: existingAdminSnap.exists ? existingAdminSnap.data()?.teacherId || '' : '',
      active: true,
      grantedBy: 'FIREBASE_ADMIN_SDK_CLI',
      createdAt: existingAdminSnap.exists && existingAdminSnap.data()?.createdAt
        ? existingAdminSnap.data().createdAt
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const userRef = db.collection('users').doc(userRecord.uid);
  const existingUserSnap = await userRef.get();
  if (existingUserSnap.exists) {
    await userRef.update({
      role,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await db.collection('auditLogs').add({
    actorUid: userRecord.uid,
    actorEmail: userRecord.email || email,
    actorRole: role,
    action: 'GRANT_STAFF_ROLE',
    entityType: 'AdminEntry',
    entityId: userRecord.uid,
    summary: `منح صلاحية ${role} عبر Firebase Admin SDK CLI`,
    createdAt: FieldValue.serverTimestamp(),
  });

  return verifyAdminAccountState({ auth, db, config, uid: userRecord.uid });
}
