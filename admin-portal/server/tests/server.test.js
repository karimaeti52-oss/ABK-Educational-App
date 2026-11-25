import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPermission,
  isRecentAuth,
  PERMISSIONS,
  resolveEffectivePermissions,
  resolveEffectiveRole,
} from '../rbac.js';
import {
  BackupPayloadSchema,
  GrantAdminSchema,
  validateSafeMediaUrl,
} from '../validators.js';

test('resolveEffectiveRole prioritizes verified superAdminEmail and claims cleanly', () => {
  const testSuperEmail = 'superadmin@test.local';
  assert.equal(
    resolveEffectiveRole({ email: testSuperEmail, email_verified: true }, null, testSuperEmail),
    'SUPER_ADMIN'
  );
  assert.equal(
    resolveEffectiveRole({ email: testSuperEmail, email_verified: false }, null, testSuperEmail),
    'STUDENT'
  );
  // Without explicit superAdminEmail config, email alone grants nothing
  assert.equal(
    resolveEffectiveRole({ email: testSuperEmail, email_verified: true }, null),
    'STUDENT'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'editor@abk.edu', email_verified: true, abkRole: 'CONTENT_MANAGER' }),
    'CONTENT_MANAGER'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'teacher@abk.edu', email_verified: true }, { role: 'TEACHER', active: true }),
    'TEACHER'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'inactive@abk.edu', email_verified: true }, { role: 'ADMIN', active: false }),
    'STUDENT'
  );
});

test('hasPermission enforces strict RBAC matrix across all 5 roles', () => {
  const superAdmin = {
    role: 'SUPER_ADMIN',
    permissions: resolveEffectivePermissions('SUPER_ADMIN'),
  };
  const contentMgr = {
    role: 'CONTENT_MANAGER',
    permissions: resolveEffectivePermissions('CONTENT_MANAGER'),
  };
  const teacher = {
    role: 'TEACHER',
    permissions: resolveEffectivePermissions('TEACHER'),
  };
  const viewer = {
    role: 'VIEWER',
    permissions: resolveEffectivePermissions('VIEWER'),
  };

  assert.equal(hasPermission(superAdmin, PERMISSIONS.MANAGE_BACKUPS), true);
  assert.equal(hasPermission(superAdmin, PERMISSIONS.MANAGE_ADMINS), true);
  assert.equal(hasPermission(contentMgr, PERMISSIONS.MANAGE_LESSONS), true);
  assert.equal(hasPermission(contentMgr, PERMISSIONS.MANAGE_ADMINS), false);
  assert.equal(hasPermission(contentMgr, PERMISSIONS.MANAGE_BACKUPS), false);
  assert.equal(hasPermission(teacher, PERMISSIONS.MANAGE_BLOCKS), true);
  assert.equal(hasPermission(teacher, PERMISSIONS.MANAGE_CATALOG), false);
  assert.equal(hasPermission(viewer, PERMISSIONS.VIEW_AUDIT), true);
  assert.equal(hasPermission(viewer, PERMISSIONS.MANAGE_BLOCKS), false);
});

test('isRecentAuth enforces fresh authentication window for sensitive operations', () => {
  const now = 1_700_000_000;
  assert.equal(isRecentAuth({ auth_time: now - 300 }, 1800, now), true);
  assert.equal(isRecentAuth({ auth_time: now - 2500 }, 1800, now), false);
  assert.equal(isRecentAuth({}, 1800, now), false);
});

test('Zod validators reject invalid RBAC emails, unsafe URLs, and malformed backups', () => {
  assert.equal(GrantAdminSchema.safeParse({ email: 'bad', role: 'ADMIN' }).success, false);
  assert.equal(
    GrantAdminSchema.safeParse({ email: 'staff@abk.edu', role: 'CONTENT_MANAGER', active: true }).success,
    true
  );
  assert.equal(validateSafeMediaUrl('https://cdn.example.com/lesson.pdf'), true);
  assert.equal(validateSafeMediaUrl('javascript:alert(1)'), false);

  const validBackup = BackupPayloadSchema.safeParse({
    version: 'abk-backup-v1',
    exportedAt: new Date().toISOString(),
    databaseId: 'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d',
    collections: {
      subjects: [{ id: 'subj_math', data: { title: 'الرياضيات' } }],
    },
  });
  assert.equal(validBackup.success, true);

  const badBackup = BackupPayloadSchema.safeParse({
    version: 'wrong-version',
    exportedAt: '',
    databaseId: 'db',
    collections: {},
  });
  assert.equal(badBackup.success, false);
});

test('Express HTTP API /api/health and /api/auth/me enforce tokens and RBAC end-to-end', async () => {
  const { createAdminApp } = await import('../app.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({ SUPER_ADMIN_EMAIL: 'superadmin@test.local' });

  const fakeServices = {
    auth: {
      async verifyIdToken(token) {
        if (token === 'valid-super-token') {
          return {
            uid: 'uid_super',
            email: 'superadmin@test.local',
            email_verified: true,
            name: 'Super Admin Test',
            auth_time: Math.floor(Date.now() / 1000),
          };
        }
        if (token === 'student-token') {
          return {
            uid: 'uid_student',
            email: 'student@example.com',
            email_verified: true,
            name: 'Student User',
            auth_time: Math.floor(Date.now() / 1000),
          };
        }
        throw Object.assign(new Error('bad token'), { code: 'auth/invalid-id-token' });
      },
      async setCustomUserClaims() {},
    },
    db: {
      collection() {
        return {
          doc() {
            return {
              async get() {
                return { exists: false, data: () => null };
              },
              async set() {},
            };
          },
          async add() {},
        };
      },
    },
    appCheck: {
      async verifyToken() {},
    },
  };

  const app = createAdminApp({ config, firebaseServices: fakeServices });
  const server = app.listen(0);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.databaseId, 'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d');

    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(unauthRes.status, 401);

    const studentRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer student-token' },
    });
    assert.equal(studentRes.status, 403);

    const superRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid-super-token' },
    });
    assert.equal(superRes.status, 200);
    const superJson = await superRes.json();
    assert.equal(superJson.role, 'SUPER_ADMIN');
    assert.equal(superJson.email, 'superadmin@test.local');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('loadConfig binds 0.0.0.0, reads PORT env var, and parses semicolon-delimited origins', async () => {
  const { loadConfig } = await import('../config.js');
  const cfg = loadConfig({
    PORT: '8080',
    ADMIN_ALLOWED_ORIGINS: 'https://gen-lang-client-0343268738.web.app;https://gen-lang-client-0343268738.firebaseapp.com',
  });
  assert.equal(cfg.host, '0.0.0.0');
  assert.equal(cfg.port, 8080);
  assert.deepEqual(cfg.allowedOrigins, [
    'https://gen-lang-client-0343268738.web.app',
    'https://gen-lang-client-0343268738.firebaseapp.com',
  ]);
});

test('User Management API lists Auth+Firestore users, revokes tokens on BAN, and enforces reauth + confirmation on DELETE', async () => {
  const { createAdminApp } = await import('../app.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({ SUPER_ADMIN_EMAIL: 'superadmin@test.local' });

  const revokedUids = [];
  const deletedAuthUids = [];
  const auditLogs = [];
  const userDocs = new Map([
    [
      'stu_1',
      {
        userId: 'stu_1',
        displayName: 'طالب أول',
        email: 'student1@abk.edu',
        role: 'STUDENT',
        accountStatus: 'ACTIVE',
      },
    ],
  ]);

  const authStore = new Map([
    [
      'stu_1',
      {
        uid: 'stu_1',
        email: 'student1@abk.edu',
        displayName: 'طالب أول',
        disabled: false,
        emailVerified: true,
        metadata: {
          creationTime: '2026-01-01T10:00:00Z',
          lastSignInTime: '2026-05-01T12:00:00Z',
        },
        providerData: [{ providerId: 'google.com' }],
      },
    ],
    [
      'stu_auth_only',
      {
        uid: 'stu_auth_only',
        email: 'authonly@abk.edu',
        displayName: 'حساب Auth فقط',
        disabled: false,
        emailVerified: true,
        metadata: {
          creationTime: '2026-02-01T10:00:00Z',
          lastSignInTime: '2026-05-02T12:00:00Z',
        },
        providerData: [{ providerId: 'google.com' }],
      },
    ],
    [
      'uid_super',
      {
        uid: 'uid_super',
        email: 'superadmin@test.local',
        displayName: 'Super Admin Test',
        disabled: false,
        emailVerified: true,
        metadata: { creationTime: '2025-12-01T00:00:00Z', lastSignInTime: '2026-05-03T00:00:00Z' },
        providerData: [{ providerId: 'google.com' }],
      },
    ],
  ]);

  const makeDocRef = (colName, docId) => ({
    id: docId,
    collection() {
      return {
        async get() {
          return { docs: [] };
        },
      };
    },
    async get() {
      if (colName === 'users' && userDocs.has(docId)) {
        return { exists: true, data: () => ({ ...userDocs.get(docId) }) };
      }
      return { exists: false, data: () => null };
    },
    async set(data) {
      if (colName === 'users') userDocs.set(docId, { ...data });
    },
    async update(data) {
      if (colName === 'users') {
        const cur = userDocs.get(docId) || {};
        const next = { ...cur, ...data };
        userDocs.set(docId, next);
      }
    },
    async delete() {
      if (colName === 'users') userDocs.delete(docId);
    },
  });

  const fakeServices = {
    auth: {
      async verifyIdToken(token) {
        const now = Math.floor(Date.now() / 1000);
        if (token === 'fresh-super') {
          return { uid: 'uid_super', email: 'superadmin@test.local', email_verified: true, auth_time: now };
        }
        if (token === 'stale-super') {
          return { uid: 'uid_super', email: 'superadmin@test.local', email_verified: true, auth_time: now - 7200 };
        }
        throw Object.assign(new Error('bad'), { code: 'auth/invalid-id-token' });
      },
      async setCustomUserClaims() {},
      async listUsers() {
        return { users: Array.from(authStore.values()) };
      },
      async getUser(uid) {
        const u = authStore.get(uid);
        if (!u) throw new Error('not found');
        return u;
      },
      async updateUser(uid, patch) {
        const u = authStore.get(uid);
        if (u) Object.assign(u, patch);
      },
      async revokeRefreshTokens(uid) {
        revokedUids.push(uid);
      },
      async deleteUser(uid) {
        deletedAuthUids.push(uid);
        authStore.delete(uid);
      },
    },
    db: {
      collection(colName) {
        return {
          doc: (docId) => makeDocRef(colName, docId),
          async get() {
            if (colName === 'users') {
              return {
                docs: Array.from(userDocs.entries()).map(([id, data]) => ({ id, data: () => ({ ...data }) })),
              };
            }
            return { docs: [] };
          },
          async add(entry) {
            if (colName === 'auditLogs') auditLogs.push(entry);
          },
        };
      },
      batch() {
        return { delete() {}, async commit() {} };
      },
    },
    appCheck: { async verifyToken() {} },
  };

  const app = createAdminApp({ config, firebaseServices: fakeServices });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. List merges Auth-only + Firestore users
    const listRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: 'Bearer fresh-super' },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.users.length, 3);
    assert.ok(listJson.users.some((u) => u.uid === 'stu_auth_only' && u.hasFirestoreProfile === false));

    // 2. Ban user revokes refresh tokens & updates Auth disabled + Firestore banReason
    const banRes = await fetch(`${baseUrl}/api/users/stu_1/status`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer fresh-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountStatus: 'BANNED', reason: 'انتحال هوية' }),
    });
    assert.equal(banRes.status, 200);
    const banJson = await banRes.json();
    assert.equal(banJson.disabled, true);
    assert.equal(banJson.revokedTokens, true);
    assert.deepEqual(revokedUids, ['stu_1']);
    assert.equal(authStore.get('stu_1').disabled, true);
    assert.equal(userDocs.get('stu_1').banReason, 'انتحال هوية');

    // 3. Super Admin primary account cannot be banned
    const lockRes = await fetch(`${baseUrl}/api/users/uid_super/status`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer fresh-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountStatus: 'BANNED' }),
    });
    assert.equal(lockRes.status, 400); // self-action blocked cleanly

    // 4. Delete requires recent reauth (428 when stale)
    const staleDel = await fetch(`${baseUrl}/api/users/stu_1`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer stale-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmTarget: 'student1@abk.edu' }),
    });
    assert.equal(staleDel.status, 428);

    // 5. Delete rejects mismatched confirmation
    const mismatchDel = await fetch(`${baseUrl}/api/users/stu_1`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer fresh-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmTarget: 'wrong@abk.edu' }),
    });
    assert.equal(mismatchDel.status, 400);

    // 6. Delete succeeds with fresh auth and email confirmation
    const okDel = await fetch(`${baseUrl}/api/users/stu_1`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer fresh-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmTarget: 'student1@abk.edu' }),
    });
    assert.equal(okDel.status, 200);
    assert.deepEqual(deletedAuthUids, ['stu_1']);
    assert.equal(userDocs.has('stu_1'), false);
    assert.ok(auditLogs.some((a) => a.action === 'BAN_USER') && auditLogs.some((a) => a.action === 'DELETE_USER'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Admin safeguards prevent self-demotion, last-admin deletion/disabling, and unauthorized SUPER_ADMIN edits', async () => {
  const { createAdminApp } = await import('../app.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({ SUPER_ADMIN_EMAIL: '' });

  const adminDocs = new Map([
    ['uid_super', { uid: 'uid_super', email: 'chief@abk.edu', role: 'SUPER_ADMIN', active: true }],
    ['uid_admin2', { uid: 'uid_admin2', email: 'helper@abk.edu', role: 'ADMIN', active: true }],
  ]);

  const authStore = new Map([
    [
      'uid_super',
      {
        uid: 'uid_super',
        email: 'chief@abk.edu',
        displayName: 'Chief Super',
        disabled: false,
        emailVerified: true,
        customClaims: { abkRole: 'SUPER_ADMIN' },
        metadata: {},
        providerData: [],
      },
    ],
    [
      'uid_admin2',
      {
        uid: 'uid_admin2',
        email: 'helper@abk.edu',
        displayName: 'Helper Admin',
        disabled: false,
        emailVerified: true,
        customClaims: { abkRole: 'ADMIN' },
        metadata: {},
        providerData: [],
      },
    ],
  ]);

  const makeDocRef = (colName, docId) => ({
    id: docId,
    collection() {
      return { async get() { return { docs: [] }; } };
    },
    async get() {
      if (colName === 'admins' && adminDocs.has(docId)) {
        return { exists: true, data: () => ({ ...adminDocs.get(docId) }) };
      }
      return { exists: false, data: () => null };
    },
    async set(data) {
      if (colName === 'admins') adminDocs.set(docId, { ...data });
    },
    async update() {},
    async delete() {
      if (colName === 'admins') adminDocs.delete(docId);
    },
  });

  const fakeServices = {
    auth: {
      async verifyIdToken(token) {
        const now = Math.floor(Date.now() / 1000);
        if (token === 'token-super') {
          return { uid: 'uid_super', email: 'chief@abk.edu', email_verified: true, abkRole: 'SUPER_ADMIN', auth_time: now };
        }
        if (token === 'token-admin2') {
          return { uid: 'uid_admin2', email: 'helper@abk.edu', email_verified: true, abkRole: 'ADMIN', auth_time: now };
        }
        throw Object.assign(new Error('bad'), { code: 'auth/invalid-id-token' });
      },
      async setCustomUserClaims(uid, claims) {
        const u = authStore.get(uid);
        if (u) u.customClaims = claims;
      },
      async getUser(uid) {
        const u = authStore.get(uid);
        if (!u) throw new Error('not found');
        return u;
      },
      async getUserByEmail(email) {
        for (const u of authStore.values()) {
          if (u.email.toLowerCase() === email.toLowerCase()) return u;
        }
        throw new Error('not found');
      },
      async updateUser(uid, patch) {
        const u = authStore.get(uid);
        if (u) Object.assign(u, patch);
      },
      async revokeRefreshTokens() {},
      async deleteUser() {},
    },
    db: {
      collection(colName) {
        return {
          doc: (docId) => makeDocRef(colName, docId),
          async get() {
            if (colName === 'admins') {
              return {
                docs: Array.from(adminDocs.entries()).map(([id, data]) => ({ id, data: () => ({ ...data }) })),
              };
            }
            return { docs: [] };
          },
          async add() {},
        };
      },
      batch() {
        return { delete() {}, async commit() {} };
      },
    },
    appCheck: { async verifyToken() {} },
  };

  const app = createAdminApp({ config, firebaseServices: fakeServices });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Self-demotion via /api/admins/grant is rejected
    const selfDemote = await fetch(`${baseUrl}/api/admins/grant`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'chief@abk.edu', role: 'VIEWER', active: false }),
    });
    assert.equal(selfDemote.status, 400);

    // 2. Super Admin can revoke secondary ADMIN when another active admin remains
    const revokeHelper = await fetch(`${baseUrl}/api/admins/revoke`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'uid_admin2' }),
    });
    assert.equal(revokeHelper.status, 200);
    assert.equal(adminDocs.has('uid_admin2'), false);

    // 3. Even if helper tries to suspend/revoke the sole remaining SUPER_ADMIN (or another SUPER_ADMIN calls it via grant/delete),
    // last active SUPER_ADMIN cannot be downgraded or disabled even when SUPER_ADMIN_EMAIL is blank
    const admin2SuspendSuper = await fetch(`${baseUrl}/api/users/uid_super/status`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token-admin2', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountStatus: 'SUSPENDED' }),
    });
    assert.equal(admin2SuspendSuper.status, 403);

    // Add a second regular admin, ensure another SUPER_ADMIN-less revoke on the sole SUPER_ADMIN is still blocked with 409
    adminDocs.set('uid_admin3', { uid: 'uid_admin3', email: 'admin3@abk.edu', role: 'ADMIN', active: true });
    authStore.set('uid_admin3', {
      uid: 'uid_admin3',
      email: 'admin3@abk.edu',
      disabled: false,
      emailVerified: true,
      customClaims: { abkRole: 'SUPER_ADMIN' }, // has SUPER_ADMIN claim, acts on uid_super (sole SUPER_ADMIN doc)
    });
    const soleSuperDemote = await fetch(`${baseUrl}/api/admins/grant`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-super', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'chief@abk.edu', role: 'ADMIN', active: true }),
    });
    assert.equal(soleSuperDemote.status, 400);

    // Deleting uid_super while only 1 active SUPER_ADMIN exists in /admins -> blocked (409 or 403)
    const adminDocsSnapshotCheck = adminDocs.get('uid_super');
    assert.equal(adminDocsSnapshotCheck.role, 'SUPER_ADMIN');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('adminCliCore verifies and grants both Custom Claims and /admins/{uid} safely via Admin SDK', async () => {
  const { grantAdminAccount, parseAdminCliArgs, verifyAdminAccountState } = await import('../adminCliCore.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({});

  const parsed = parseAdminCliArgs(['--grant', '--email', 'admin@example.com', '--role', 'SUPER_ADMIN']);
  assert.equal(parsed.mode, 'grant');
  assert.equal(parsed.email, 'admin@example.com');
  assert.equal(parsed.role, 'SUPER_ADMIN');

  const adminsMap = new Map();
  const usersMap = new Map([
    ['uid_target', { userId: 'uid_target', email: 'admin@example.com', role: 'STUDENT', accountStatus: 'ACTIVE' }],
  ]);
  const logs = [];
  const authUser = {
    uid: 'uid_target',
    email: 'admin@example.com',
    displayName: 'Platform Owner',
    emailVerified: true,
    disabled: false,
    customClaims: {},
  };

  const auth = {
    async getUserByEmail(email) {
      if (email !== authUser.email) throw new Error('not found');
      return authUser;
    },
    async getUser(uid) {
      if (uid !== authUser.uid) throw new Error('not found');
      return authUser;
    },
    async setCustomUserClaims(uid, claims) {
      if (uid === authUser.uid) authUser.customClaims = claims;
    },
  };

  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const map = name === 'admins' ? adminsMap : usersMap;
              return map.has(id) ? { exists: true, data: () => map.get(id) } : { exists: false, data: () => null };
            },
            async set(data) {
              if (name === 'admins') adminsMap.set(id, { ...(adminsMap.get(id) || {}), ...data });
            },
            async update(data) {
              if (name === 'users' && usersMap.has(id)) {
                usersMap.set(id, { ...usersMap.get(id), ...data });
              }
            },
          };
        },
        async get() {
          if (name === 'admins') {
            return { docs: Array.from(adminsMap.entries()).map(([id, data]) => ({ id, data: () => data })) };
          }
          return { docs: [] };
        },
        async add(entry) {
          logs.push(entry);
        },
      };
    },
  };

  const FieldValueMock = { serverTimestamp: () => 'SERVER_TS' };

  const beforeState = await verifyAdminAccountState({ auth, db, config, email: 'admin@example.com' });
  assert.equal(beforeState.checks.readyForFirestore, false);
  assert.equal(beforeState.checks.readyForStorage, false);
  assert.equal(beforeState.checks.readyForFullAdmin, false);

  const afterState = await grantAdminAccount({
    auth,
    db,
    FieldValue: FieldValueMock,
    config,
    email: 'admin@example.com',
    role: 'SUPER_ADMIN',
  });
  assert.equal(afterState.customClaims.abkRole, 'SUPER_ADMIN');
  assert.equal(afterState.adminsDoc.exists, true);
  assert.equal(afterState.adminsDoc.active, true);
  assert.equal(afterState.adminsDoc.role, 'SUPER_ADMIN');
  assert.equal(afterState.userProfile.role, 'SUPER_ADMIN');
  assert.equal(afterState.checks.readyForFirestore, true);
  assert.equal(afterState.checks.readyForStorage, true);
  assert.equal(afterState.checks.readyForFullAdmin, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'GRANT_STAFF_ROLE');
});

test('loadConfig leaves service account key fields empty so Firebase Admin SDK uses ADC/WIF', async () => {
  const { loadConfig } = await import('../config.js');
  const cfg = loadConfig({
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/gha-oidc-adc.json',
  });
  assert.equal(cfg.serviceAccountJson, '');
  assert.equal(cfg.serviceAccountFile, '');
  assert.equal(cfg.projectId, 'gen-lang-client-0343268738');
  assert.equal(
    cfg.databaseId,
    'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d'
  );
});

test('initFirebaseAdmin initializes Auth and named Firestore with external_account WIF ADC config locally without private_key', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { loadConfig } = await import('../config.js');
  const { initFirebaseAdmin } = await import('../firebaseAdmin.js');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abk-wif-test-'));
  const credFile = path.join(tmpDir, 'external-account.json');
  const tokenFile = path.join(tmpDir, 'oidc-token');
  fs.writeFileSync(tokenFile, 'header.payload.signature', 'utf8');
  fs.writeFileSync(
    credFile,
    JSON.stringify({
      type: 'external_account',
      audience: '//iam.googleapis.com/projects/000000000000/locations/global/workloadIdentityPools/test-pool/providers/test-provider',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url:
        'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/test@example.iam.gserviceaccount.com:generateAccessToken',
      credential_source: { file: tokenFile },
    }),
    'utf8'
  );

  const prevCred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let initializedApp = null;
  try {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credFile;
    const cfg = loadConfig({});
    const { app, auth, db } = initFirebaseAdmin(cfg);
    initializedApp = app;
    assert.equal(app.options.projectId, cfg.projectId);
    assert.equal(typeof auth.getUserByEmail, 'function');
    assert.equal(typeof auth.setCustomUserClaims, 'function');
    assert.equal(typeof db.collection, 'function');
  } finally {
    if (initializedApp) {
      await initializedApp.delete();
    }
    if (prevCred === undefined) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = prevCred;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveEffectiveRole rejects missing active, non-boolean active, invalid role, and blocks disabled admin even with cached claims', () => {
  assert.equal(
    resolveEffectiveRole({ email: 'staff@abk.edu', email_verified: true }, { role: 'SUPER_ADMIN' }),
    'STUDENT'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'staff@abk.edu', email_verified: true }, { role: 'ADMIN', active: 'true' }),
    'STUDENT'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'staff@abk.edu', email_verified: true }, { active: true }),
    'STUDENT'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'staff@abk.edu', email_verified: true }, { active: true, role: 'OWNER' }),
    'STUDENT'
  );
  assert.equal(
    resolveEffectiveRole(
      { email: 'disabled@abk.edu', email_verified: true, abkRole: 'SUPER_ADMIN' },
      { active: false, role: 'SUPER_ADMIN' }
    ),
    'STUDENT'
  );
});

test('adminCliCore rejects missing user, unverified email, disabled Auth user, missing active, active=false, and invalid /admins role', async () => {
  const { grantAdminAccount, verifyAdminAccountState } = await import('../adminCliCore.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({});

  const adminsMap = new Map();
  const usersMap = new Map();
  const authUsers = new Map([
    [
      'uid_unverified',
      {
        uid: 'uid_unverified',
        email: 'unverified@abk.edu',
        emailVerified: false,
        disabled: false,
        customClaims: { abkRole: 'SUPER_ADMIN' },
      },
    ],
    [
      'uid_disabled',
      {
        uid: 'uid_disabled',
        email: 'disabled@abk.edu',
        emailVerified: true,
        disabled: true,
        customClaims: { abkRole: 'SUPER_ADMIN' },
      },
    ],
    [
      'uid_partial',
      {
        uid: 'uid_partial',
        email: 'partial@abk.edu',
        emailVerified: true,
        disabled: false,
        customClaims: { abkRole: 'SUPER_ADMIN' },
      },
    ],
  ]);

  const auth = {
    async getUserByEmail(email) {
      for (const u of authUsers.values()) {
        if (u.email === email) return u;
      }
      throw new Error('auth/user-not-found');
    },
    async getUser(uid) {
      const u = authUsers.get(uid);
      if (!u) throw new Error('auth/user-not-found');
      return u;
    },
    async setCustomUserClaims() {},
  };

  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const map = name === 'admins' ? adminsMap : usersMap;
              return map.has(id) ? { exists: true, data: () => map.get(id) } : { exists: false, data: () => null };
            },
            async set() {},
            async update() {},
          };
        },
        async get() {
          if (name === 'admins') {
            return { docs: Array.from(adminsMap.entries()).map(([id, data]) => ({ id, data: () => data })) };
          }
          return { docs: [] };
        },
        async add() {},
      };
    },
  };
  const FieldValueMock = { serverTimestamp: () => 'TS' };

  await assert.rejects(
    verifyAdminAccountState({ auth, db, config, email: 'missing@abk.edu' }),
    /user-not-found/
  );
  await assert.rejects(
    grantAdminAccount({ auth, db, FieldValue: FieldValueMock, config, email: 'unverified@abk.edu', role: 'SUPER_ADMIN' }),
    /emailVerified=false/
  );
  await assert.rejects(
    grantAdminAccount({ auth, db, FieldValue: FieldValueMock, config, email: 'disabled@abk.edu', role: 'SUPER_ADMIN' }),
    /disabled=true/
  );

  // Disabled Auth account never reports ready
  adminsMap.set('uid_disabled', { uid: 'uid_disabled', role: 'SUPER_ADMIN', active: true });
  const disabledState = await verifyAdminAccountState({ auth, db, config, email: 'disabled@abk.edu' });
  assert.equal(disabledState.checks.readyForFirestore, false);
  assert.equal(disabledState.checks.readyForStorage, false);
  assert.equal(disabledState.checks.readyForFullAdmin, false);

  // Missing active field on /admins/{uid} -> hasActiveAdminDoc=false, readyForFullAdmin=false
  adminsMap.set('uid_partial', { uid: 'uid_partial', role: 'SUPER_ADMIN' });
  const missingActiveState = await verifyAdminAccountState({ auth, db, config, email: 'partial@abk.edu' });
  assert.equal(missingActiveState.adminsDoc.active, false);
  assert.equal(missingActiveState.checks.hasActiveAdminDoc, false);
  assert.equal(missingActiveState.checks.readyForFullAdmin, false);

  // active=false on /admins/{uid} -> blocks even if claim exists
  adminsMap.set('uid_partial', { uid: 'uid_partial', role: 'SUPER_ADMIN', active: false });
  const inactiveState = await verifyAdminAccountState({ auth, db, config, email: 'partial@abk.edu' });
  assert.equal(inactiveState.checks.hasActiveAdminDoc, false);
  assert.equal(inactiveState.checks.readyForFirestore, false);
  assert.equal(inactiveState.checks.readyForStorage, false);
  assert.equal(inactiveState.checks.readyForFullAdmin, false);

  // active=true with invalid role -> roleValid=false, hasActiveAdminDoc=false
  adminsMap.set('uid_partial', { uid: 'uid_partial', role: 'INVALID_ROLE', active: true });
  const invalidRoleState = await verifyAdminAccountState({ auth, db, config, email: 'partial@abk.edu' });
  assert.equal(invalidRoleState.adminsDoc.roleValid, false);
  assert.equal(invalidRoleState.checks.hasActiveAdminDoc, false);
  assert.equal(invalidRoleState.checks.readyForFullAdmin, false);
  assert.equal(invalidRoleState.checks.isSuperAdminReady, false);

  // Claim vs /admins/{uid} role conflict -> hasClaimDocConflict=true, isSuperAdminReady=false
  authUsers.get('uid_partial').customClaims = { abkRole: 'ADMIN' };
  adminsMap.set('uid_partial', {
    uid: 'uid_partial',
    email: 'partial@abk.edu',
    role: 'SUPER_ADMIN',
    active: true,
  });
  const conflictState = await verifyAdminAccountState({ auth, db, config, email: 'partial@abk.edu' });
  assert.equal(conflictState.checks.hasClaimDocConflict, true);
  assert.equal(conflictState.checks.isSuperAdminReady, false);
  assert.equal(conflictState.adminsDoc.uidMatchesDoc, true);
  assert.equal(conflictState.adminsDoc.emailMatchesDoc, true);

  // Clean SUPER_ADMIN match -> hasClaimDocConflict=false, isSuperAdminReady=true
  authUsers.get('uid_partial').customClaims = { abkRole: 'SUPER_ADMIN' };
  const cleanSuperState = await verifyAdminAccountState({ auth, db, config, email: 'partial@abk.edu' });
  assert.equal(cleanSuperState.checks.hasClaimDocConflict, false);
  assert.equal(cleanSuperState.checks.isSuperAdminReady, true);
});

test('Portal API rejects non-SUPER_ADMIN self-upgrade and blocks removing the sole remaining SUPER_ADMIN doc', async () => {
  const { createAdminApp } = await import('../app.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({ SUPER_ADMIN_EMAIL: '' });

  const adminDocs = new Map([
    ['uid_sole_super', { uid: 'uid_sole_super', email: 'sole@abk.edu', role: 'SUPER_ADMIN', active: true }],
    ['uid_content', { uid: 'uid_content', email: 'cm@abk.edu', role: 'CONTENT_MANAGER', active: true }],
  ]);

  const authStore = new Map([
    [
      'uid_sole_super',
      {
        uid: 'uid_sole_super',
        email: 'sole@abk.edu',
        emailVerified: true,
        disabled: false,
        customClaims: { abkRole: 'SUPER_ADMIN' },
      },
    ],
    [
      'uid_content',
      {
        uid: 'uid_content',
        email: 'cm@abk.edu',
        emailVerified: true,
        disabled: false,
        customClaims: { abkRole: 'CONTENT_MANAGER' },
      },
    ],
    [
      'uid_external_super',
      {
        uid: 'uid_external_super',
        email: 'ops@abk.edu',
        emailVerified: true,
        disabled: false,
        customClaims: { abkRole: 'SUPER_ADMIN' },
      },
    ],
  ]);

  const fakeServices = {
    auth: {
      async verifyIdToken(token) {
        const now = Math.floor(Date.now() / 1000);
        if (token === 'cm-token') {
          return { uid: 'uid_content', email: 'cm@abk.edu', email_verified: true, abkRole: 'CONTENT_MANAGER', auth_time: now };
        }
        if (token === 'ext-super-token') {
          return { uid: 'uid_external_super', email: 'ops@abk.edu', email_verified: true, abkRole: 'SUPER_ADMIN', auth_time: now };
        }
        throw Object.assign(new Error('bad'), { code: 'auth/invalid-id-token' });
      },
      async getUserByEmail(email) {
        for (const u of authStore.values()) {
          if (u.email === email) return u;
        }
        throw new Error('not found');
      },
      async getUser(uid) {
        const u = authStore.get(uid);
        if (!u) throw new Error('not found');
        return u;
      },
      async setCustomUserClaims() {},
    },
    db: {
      collection(name) {
        return {
          doc(id) {
            return {
              async get() {
                if (name === 'admins' && adminDocs.has(id)) {
                  return { exists: true, data: () => ({ ...adminDocs.get(id) }) };
                }
                return { exists: false, data: () => null };
              },
              async set() {},
              async delete() {
                if (name === 'admins') adminDocs.delete(id);
              },
            };
          },
          async get() {
            if (name === 'admins') {
              return { docs: Array.from(adminDocs.entries()).map(([id, data]) => ({ id, data: () => ({ ...data }) })) };
            }
            return { docs: [] };
          },
          async add() {},
        };
      },
    },
    appCheck: { async verifyToken() {} },
  };

  const app = createAdminApp({ config, firebaseServices: fakeServices });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // CONTENT_MANAGER cannot self-upgrade to SUPER_ADMIN
    const selfUpgradeRes = await fetch(`${baseUrl}/api/admins/grant`, {
      method: 'POST',
      headers: { Authorization: 'Bearer cm-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cm@abk.edu', role: 'SUPER_ADMIN', active: true }),
    });
    assert.equal(selfUpgradeRes.status, 403);

    // Another SUPER_ADMIN cannot revoke or demote the sole remaining active SUPER_ADMIN in /admins
    const revokeSoleRes = await fetch(`${baseUrl}/api/admins/revoke`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ext-super-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'uid_sole_super' }),
    });
    assert.equal(revokeSoleRes.status, 409);

    const demoteSoleRes = await fetch(`${baseUrl}/api/admins/grant`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ext-super-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sole@abk.edu', role: 'ADMIN', active: true }),
    });
    assert.equal(demoteSoleRes.status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('firebase-admin-check.yml enforces manual OIDC/WIF guards, split SAs, and zero PII/secrets leakage', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const workflowPath = path.resolve(import.meta.dirname, '../../../.github/workflows/firebase-admin-check.yml');
  const content = fs.readFileSync(workflowPath, 'utf8');

  assert.ok(content.includes('workflow_dispatch:'));
  assert.ok(content.includes("default: verify_only"));
  assert.ok(content.includes('contents: read'));
  assert.ok(content.includes('id-token: write'));
  assert.ok(content.includes('google-github-actions/auth@v2'));
  assert.ok(content.includes("github.repository == 'karimaeti52-oss/ABK-Educational-App'"));
  assert.ok(content.includes("github.ref == 'refs/heads/main'"));
  assert.ok(content.includes('github.actor == github.repository_owner'));
  assert.ok(content.includes('CONFIRM_SUPER_ADMIN'));
  assert.ok(content.includes('GCP_WIF_VERIFY_SERVICE_ACCOUNT'));
  assert.ok(content.includes('GCP_WIF_GRANT_SERVICE_ACCOUNT'));
  assert.ok(content.includes('cleanup_credentials: true'));

  assert.equal(content.includes('FIREBASE_SERVICE_ACCOUNT_JSON'), false);
  assert.equal(content.includes('FIREBASE_SERVICE_ACCOUNT_BASE64'), false);
  assert.equal(content.includes('karimaeti07'), false);
  assert.equal(content.includes('final.get(\'uid\')'), false);
  assert.equal(content.includes('/admins/{uid}`'), false);
});

test('All auth/RBAC layers unify strict active === true + valid role policy with zero legacy ADMIN fallback', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '../../..');

  const files = [
    'firestore.rules',
    'cloudflare-worker/src/auth.js',
    'admin-portal/server/rbac.js',
    'admin-portal/server/app.js',
    'admin-portal/server/adminCliCore.js',
    'admin-portal/src/utils/staffRole.ts',
    'admin-portal/src/sections/UsersAndAdminsSection.tsx',
    'app/src/main/java/com/example/data/repository/StudentRepository.kt',
    'app/src/main/java/com/example/data/repository/AdminRepository.kt',
  ];

  for (const rel of files) {
    const txt = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/active\s*!==\s*false|active"\)\s*!=\s*false|!\('active'\s+in\s+adminDocData/.test(txt), false, `Found legacy active!=false fallback in ${rel}`);
  }

  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.ok(rules.includes('function isAdminDocDisabled()'));
  assert.ok(rules.includes('adminDocData().active == true'));
  assert.ok(rules.includes("data.keys().hasAll(['uid', 'email', 'role', 'active', 'grantedBy', 'createdAt'])"));

  const workerAuth = fs.readFileSync(path.join(root, 'cloudflare-worker/src/auth.js'), 'utf8');
  assert.ok(workerAuth.includes('adminDoc.active === false'));
  assert.ok(workerAuth.includes('adminDoc.active === true'));
});

test('Backend RBAC accepts active SUPER_ADMIN /admins/{uid} without Custom Claim, normalizes hidden formatting, and rejects UID mismatches', async () => {
  const { createAdminApp } = await import('../app.js');
  const { loadConfig } = await import('../config.js');
  const config = loadConfig({ SUPER_ADMIN_EMAIL: '' });

  // Unit checks for resolveEffectiveRole
  assert.equal(
    resolveEffectiveRole(
      { uid: '5bIqNT2H3pVniVd6ULYkwps55c43', email: 'karimaeti07@gmail.com', email_verified: true },
      { uid: '5bIqNT2H3pVniVd6ULYkwps55c43', email: 'karimaeti07@gmail.com', role: 'SUPER_ADMIN', active: true }
    ),
    'SUPER_ADMIN'
  );
  assert.equal(
    resolveEffectiveRole(
      { uid: '5bIqNT2H3pVniVd6ULYkwps55c43', email: 'karimaeti07@gmail.com', email_verified: true },
      { uid: '5bIqNT2H3pVniVd6ULYkwps55c43', role: ' SUPER_ADMIN\u200F ', active: true }
    ),
    'SUPER_ADMIN'
  );
  assert.equal(
    resolveEffectiveRole(
      { uid: '5bIqNT2H3pVniVd6ULYkwps55c43', email: 'karimaeti07@gmail.com', email_verified: true },
      { uid: 'wrong_uid', role: 'SUPER_ADMIN', active: true }
    ),
    'STUDENT'
  );
  assert.equal(
    resolveEffectiveRole(
      { uid: '5bIqNT2H3pVniVd6ULYkwps55c43', email: 'karimaeti07@gmail.com', email_verified: true },
      { role: 'SUPER_ADMIN', active: true }
    ),
    'STUDENT'
  );

  const adminDocs = new Map([
    [
      '5bIqNT2H3pVniVd6ULYkwps55c43',
      {
        uid: '5bIqNT2H3pVniVd6ULYkwps55c43',
        email: 'karimaeti07@gmail.com',
        role: 'SUPER_ADMIN',
        active: true,
        grantedBy: 'FIREBASE_CONSOLE_BOOTSTRAP',
      },
    ],
    [
      'uid_bad_doc',
      {
        uid: 'different_uid',
        email: 'mismatch@abk.edu',
        role: 'SUPER_ADMIN',
        active: true,
      },
    ],
  ]);

  const app = createAdminApp({
    config,
    firebaseServices: {
      auth: {
        async verifyIdToken(token) {
          const now = Math.floor(Date.now() / 1000);
          if (token === 'owner-doc-only') {
            return {
              uid: '5bIqNT2H3pVniVd6ULYkwps55c43',
              email: 'karimaeti07@gmail.com',
              email_verified: true,
              auth_time: now,
            };
          }
          if (token === 'mismatch-doc') {
            return {
              uid: 'uid_bad_doc',
              email: 'mismatch@abk.edu',
              email_verified: true,
              auth_time: now,
            };
          }
          throw Object.assign(new Error('invalid'), { code: 'auth/invalid-id-token' });
        },
        async setCustomUserClaims() {},
      },
      db: {
        collection(name) {
          return {
            doc(id) {
              return {
                async get() {
                  if (name === 'admins' && adminDocs.has(id)) {
                    return { exists: true, data: () => ({ ...adminDocs.get(id) }) };
                  }
                  return { exists: false, data: () => null };
                },
                async set() {},
              };
            },
            async add() {},
          };
        },
      },
      appCheck: { async verifyToken() {} },
    },
  });

  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const okRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer owner-doc-only' },
    });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.role, 'SUPER_ADMIN');
    assert.equal(okJson.uid, '5bIqNT2H3pVniVd6ULYkwps55c43');

    const badRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer mismatch-doc' },
    });
    assert.equal(badRes.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

