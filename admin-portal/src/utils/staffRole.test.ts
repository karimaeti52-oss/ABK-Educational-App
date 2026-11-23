import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFrontendStaffRole } from './staffRole.ts';

test('resolveFrontendStaffRole accepts valid abkRole claims and active === true /admins documents with valid roles', () => {
  const superAdmin = resolveFrontendStaffRole({
    claims: { abkRole: 'SUPER_ADMIN', abkPermissions: ['manage_admins'] },
    adminDoc: null,
  });
  assert.deepEqual(superAdmin, {
    role: 'SUPER_ADMIN',
    permissions: ['manage_admins'],
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

  const adminFromActiveDoc = resolveFrontendStaffRole({
    claims: {},
    adminDoc: { active: true, role: 'ADMIN', permissions: ['manage_lessons'] },
  });
  assert.deepEqual(adminFromActiveDoc, {
    role: 'ADMIN',
    permissions: ['manage_lessons'],
    teacherId: null,
  });

  const contentManagerFromDoc = resolveFrontendStaffRole({
    claims: {},
    adminDoc: { active: true, role: 'CONTENT_MANAGER', permissions: ['manage_catalog'] },
  });
  assert.deepEqual(contentManagerFromDoc, {
    role: 'CONTENT_MANAGER',
    permissions: ['manage_catalog'],
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

test('resolveFrontendStaffRole rejects /admins docs with missing active, non-boolean active, or invalid/missing role', () => {
  // active is missing (undefined) -> must NOT grant access
  assert.equal(
    resolveFrontendStaffRole({
      claims: {},
      adminDoc: { role: 'SUPER_ADMIN' },
    }),
    null
  );

  // active is non-boolean truthy value -> must NOT satisfy active === true
  assert.equal(
    resolveFrontendStaffRole({
      claims: {},
      adminDoc: { active: 'true' as unknown as boolean, role: 'ADMIN' },
    }),
    null
  );

  // active === true but role is missing -> must NOT silently default to ADMIN
  assert.equal(
    resolveFrontendStaffRole({
      claims: {},
      adminDoc: { active: true },
    }),
    null
  );

  // active === true but role is outside allowed STAFF_ROLES -> must return null
  assert.equal(
    resolveFrontendStaffRole({
      claims: {},
      adminDoc: { active: true, role: 'STUDENT' as unknown as 'ADMIN' },
    }),
    null
  );

  assert.equal(
    resolveFrontendStaffRole({
      claims: {},
      adminDoc: { active: true, role: 'OWNER' as unknown as 'ADMIN' },
    }),
    null
  );
});

test('resolveFrontendStaffRole blocks active === false admin accounts even when cached claims remain', () => {
  assert.throws(
    () =>
      resolveFrontendStaffRole({
        claims: { abkRole: 'SUPER_ADMIN' },
        adminDoc: { active: false, role: 'SUPER_ADMIN' },
      }),
    /تعطيل/
  );

  assert.throws(
    () =>
      resolveFrontendStaffRole({
        claims: {},
        adminDoc: { active: false, role: 'ADMIN' },
      }),
    /تعطيل/
  );
});
