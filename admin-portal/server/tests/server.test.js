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
  assert.equal(
    resolveEffectiveRole({ email: 'karimaeti07@gmail.com', email_verified: true }),
    'SUPER_ADMIN'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'karimaeti07@gmail.com', email_verified: false }),
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
  const config = loadConfig({});

  const fakeServices = {
    auth: {
      async verifyIdToken(token) {
        if (token === 'valid-super-token') {
          return {
            uid: 'uid_super',
            email: 'karimaeti07@gmail.com',
            email_verified: true,
            name: 'Kareem Super Admin',
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
    assert.equal(superJson.email, 'karimaeti07@gmail.com');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('loadConfig binds 0.0.0.0, reads Cloud Run PORT, and parses semicolon-delimited origins', async () => {
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

