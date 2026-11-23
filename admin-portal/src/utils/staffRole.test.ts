import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFrontendStaffRole } from './staffRole.ts';

test('resolveFrontendStaffRole accepts valid abkRole claims and active /admins documents', () => {
  const superAdmin = resolveFrontendStaffRole({
    claims: { abkRole: 'SUPER_ADMIN' },
    adminDoc: null,
  });
  assert.deepEqual(superAdmin, {
    role: 'SUPER_ADMIN',
    permissions: [],
    teacherId: null,
  });

  const teacherFromClaim = resolveFrontendStaffRole({
    claims: { abkRole: 'TEACHER', teacherId: 'teacher_1' },
    adminDoc: null,
  });
  assert.deepEqual(teacherFromClaim, {
    role: 'TEACHER',
    permissions: [],
    teacherId: 'teacher_1',
  });

  const adminFromDocDefault = resolveFrontendStaffRole({
    claims: {},
    adminDoc: { active: true, permissions: ['MANAGE_LESSONS'] },
  });
  assert.deepEqual(adminFromDocDefault, {
    role: 'ADMIN',
    permissions: ['MANAGE_LESSONS'],
    teacherId: null,
  });

  const contentManagerFromDoc = resolveFrontendStaffRole({
    claims: {},
    adminDoc: { active: true, role: 'CONTENT_MANAGER', permissions: ['MANAGE_CATALOG'] },
  });
  assert.deepEqual(contentManagerFromDoc, {
    role: 'CONTENT_MANAGER',
    permissions: ['MANAGE_CATALOG'],
    teacherId: null,
  });
});

test('resolveFrontendStaffRole rejects legacy admin, abkStaff, and role claim fallbacks', () => {
  assert.equal(
    resolveFrontendStaffRole({
      claims: { admin: true },
      adminDoc: null,
    }),
    null
  );

  assert.equal(
    resolveFrontendStaffRole({
      claims: { abkStaff: true },
      adminDoc: null,
    }),
    null
  );

  assert.equal(
    resolveFrontendStaffRole({
      claims: { role: 'SUPER_ADMIN' },
      adminDoc: null,
    }),
    null
  );

  assert.equal(
    resolveFrontendStaffRole({
      claims: { abkRole: 'STUDENT', admin: true, abkStaff: true },
      adminDoc: null,
    }),
    null
  );
});

test('resolveFrontendStaffRole blocks disabled admin accounts even when cached claims remain', () => {
  assert.throws(
    () =>
      resolveFrontendStaffRole({
        claims: { abkRole: 'SUPER_ADMIN' },
        adminDoc: { active: false, role: 'SUPER_ADMIN' },
      }),
    /تعطيل/
  );
});
