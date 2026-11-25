import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFirestoreAdminReadError,
  createAuthRequestGuard,
  diagnoseClientAdminAccess,
  formatGooglePopupErrorMessage,
  formatRawValueForDiagnostics,
  normalizeStaffRole,
  resolveAdminPortalSession,
  resolveFrontendStaffRole,
  runClientAdminDiagnostic,
} from './staffRole.ts';

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

test('diagnoseClientAdminAccess distinguishes missing admins/{uid} doc, active !== true, and invalid role', () => {
  const missingDoc = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: false,
    adminDoc: null,
  });
  assert.equal(missingDoc.allowed, false);
  assert.equal(missingDoc.primaryReasonCode, 'ADMIN_DOC_MISSING');
  assert.equal(missingDoc.adminDocCheck.status, 'NOT_FOUND');
  assert.equal(missingDoc.claimCheck.present, false);
  assert.equal(missingDoc.conflictCheck.hasConflict, false);

  const missingActive = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', role: 'SUPER_ADMIN' },
  });
  assert.equal(missingActive.allowed, false);
  assert.equal(missingActive.primaryReasonCode, 'ADMIN_DOC_INACTIVE');
  assert.equal(missingActive.adminDocCheck.status, 'ACTIVE_NOT_TRUE');
  assert.equal(missingActive.adminDocCheck.activeIsTrue, false);

  const stringTrueActive = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', active: 'true' as unknown as boolean, role: 'SUPER_ADMIN' },
  });
  assert.equal(stringTrueActive.allowed, false);
  assert.equal(stringTrueActive.primaryReasonCode, 'ADMIN_DOC_INACTIVE');
  assert.equal(stringTrueActive.adminDocCheck.status, 'ACTIVE_NOT_TRUE');

  const disabledDocWithClaim = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: { abkRole: 'SUPER_ADMIN' },
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', active: false, role: 'SUPER_ADMIN' },
  });
  assert.equal(disabledDocWithClaim.allowed, false);
  assert.equal(disabledDocWithClaim.primaryReasonCode, 'ADMIN_DISABLED');
  assert.equal(disabledDocWithClaim.conflictCheck.hasConflict, true);
  assert.equal(disabledDocWithClaim.conflictCheck.conflictType, 'CLAIM_WITHOUT_ACTIVE_DOC');

  const invalidRole = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', active: true, role: 'OWNER' as unknown as 'ADMIN' },
  });
  assert.equal(invalidRole.allowed, false);
  assert.equal(invalidRole.primaryReasonCode, 'ADMIN_DOC_INVALID_ROLE');
  assert.equal(invalidRole.adminDocCheck.status, 'INVALID_ROLE');
});

test('diagnoseClientAdminAccess detects Claim vs Firestore conflicts across mismatch, claim-only, and doc-only states', () => {
  const deniedRoleMismatch = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: { abkRole: 'STUDENT' },
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', active: true, role: 'OWNER' as unknown as 'ADMIN' },
  });
  assert.equal(deniedRoleMismatch.allowed, false);
  assert.equal(deniedRoleMismatch.primaryReasonCode, 'CLAIM_DOC_CONFLICT');
  assert.equal(deniedRoleMismatch.conflictCheck.hasConflict, true);
  assert.equal(deniedRoleMismatch.conflictCheck.conflictType, 'ROLE_MISMATCH');

  const validRoleMismatch = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: { abkRole: 'ADMIN' },
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', active: true, role: 'SUPER_ADMIN' },
  });
  assert.equal(validRoleMismatch.allowed, true);
  assert.equal(validRoleMismatch.resolvedRole, 'ADMIN');
  assert.equal(validRoleMismatch.conflictCheck.hasConflict, true);
  assert.equal(validRoleMismatch.conflictCheck.conflictType, 'ROLE_MISMATCH');

  const claimWithoutDoc = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: { abkRole: 'SUPER_ADMIN' },
    adminDocExists: false,
    adminDoc: null,
  });
  assert.equal(claimWithoutDoc.allowed, true);
  assert.equal(claimWithoutDoc.conflictCheck.hasConflict, true);
  assert.equal(claimWithoutDoc.conflictCheck.conflictType, 'CLAIM_WITHOUT_ACTIVE_DOC');

  const docWithoutClaim = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: true,
    adminDoc: { uid: 'uid_1', active: true, role: 'SUPER_ADMIN' },
  });
  assert.equal(docWithoutClaim.allowed, true);
  assert.equal(docWithoutClaim.resolvedRole, 'SUPER_ADMIN');
  assert.equal(docWithoutClaim.conflictCheck.hasConflict, true);
  assert.equal(docWithoutClaim.conflictCheck.conflictType, 'DOC_WITHOUT_VALID_CLAIM');
});

test('diagnoseClientAdminAccess distinguishes permission, network, and database Firestore read errors', () => {
  const perm = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: false,
    adminDoc: null,
    adminDocError: { code: 'firestore/permission-denied', message: 'Missing or insufficient permissions' },
  });
  assert.equal(perm.allowed, false);
  assert.equal(perm.primaryReasonCode, 'FIRESTORE_PERMISSION_ERROR');
  assert.equal(perm.adminDocCheck.status, 'READ_ERROR');
  assert.equal(perm.adminDocCheck.errorKind, 'PERMISSION_DENIED');

  const net = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: false,
    adminDoc: null,
    adminDocError: { code: 'unavailable', message: 'Could not reach Cloud Firestore backend' },
  });
  assert.equal(net.allowed, false);
  assert.equal(net.primaryReasonCode, 'FIRESTORE_NETWORK_ERROR');
  assert.equal(net.adminDocCheck.errorKind, 'UNAVAILABLE_OR_NETWORK');

  const dbErr = diagnoseClientAdminAccess({
    uid: 'uid_1',
    claims: {},
    adminDocExists: false,
    adminDoc: null,
    adminDocError: { code: 'not-found', message: 'Database does not exist' },
  });
  assert.equal(dbErr.allowed, false);
  assert.equal(dbErr.primaryReasonCode, 'FIRESTORE_DATABASE_ERROR');
  assert.equal(dbErr.adminDocCheck.errorKind, 'DATABASE_OR_CONFIG');

  const unknownClassified = classifyFirestoreAdminReadError(new Error('unexpected failure'));
  assert.equal(unknownClassified.kind, 'UNKNOWN');
});

test('runClientAdminDiagnostic reads only current user claims and own admins/{uid} doc without listing collections', async () => {
  const readTargets: string[] = [];

  const result = await runClientAdminDiagnostic({
    uid: 'uid_self_123',
    readIdTokenResult: async () => ({ claims: {} }),
    readOwnAdminDoc: async (targetUid) => {
      readTargets.push(targetUid);
      return {
        exists: () => false,
        data: () => undefined,
      };
    },
  });

  assert.deepEqual(readTargets, ['uid_self_123']);
  assert.equal(result.diagnosis.allowed, false);
  assert.equal(result.diagnosis.primaryReasonCode, 'ADMIN_DOC_MISSING');
  assert.equal(result.diagnosis.adminDocCheck.status, 'NOT_FOUND');

  const backendBlocked = await runClientAdminDiagnostic({
    uid: 'uid_self_123',
    readIdTokenResult: async () => ({ claims: { abkRole: 'ADMIN' } }),
    readOwnAdminDoc: async (targetUid) => ({
      exists: () => true,
      data: () => ({ uid: targetUid, active: true, role: 'SUPER_ADMIN' }),
    }),
    backendErrorMessage: 'الحساب موقوف من الخادم',
  });

  assert.equal(backendBlocked.diagnosis.allowed, false);
  assert.equal(backendBlocked.diagnosis.primaryReasonCode, 'BACKEND_FORBIDDEN');
  assert.equal(backendBlocked.diagnosis.primaryMessage, 'الحساب موقوف من الخادم');
  assert.equal(backendBlocked.diagnosis.conflictCheck.hasConflict, true);
  assert.equal(backendBlocked.diagnosis.conflictCheck.conflictType, 'ROLE_MISMATCH');
});

test('createAuthRequestGuard invalidates stale requests on account switch, refresh overlap, and sign-out', async () => {
  const guard = createAuthRequestGuard();

  const reqA = guard.begin('uid_A');
  assert.equal(guard.isCurrent(reqA, 'uid_A'), true);

  // Overlapping refresh for same user invalidates earlier request
  const reqARefresh = guard.begin('uid_A');
  assert.equal(guard.isCurrent(reqA, 'uid_A'), false);
  assert.equal(guard.isCurrent(reqARefresh, 'uid_A'), true);

  // Switching to account B invalidates any pending request for account A
  const reqB = guard.begin('uid_B');
  assert.equal(guard.isCurrent(reqARefresh, 'uid_A'), false);
  assert.equal(guard.isCurrent(reqB, 'uid_B'), true);

  // Signing out invalidates everything (both via invalidate() and begin(null))
  guard.invalidate();
  assert.equal(guard.isCurrent(reqB, 'uid_B'), false);

  const reqSignOut = guard.begin(null);
  assert.equal(guard.isCurrent(reqB, 'uid_B'), false);
  assert.equal(guard.isCurrent(reqSignOut, null), true);

  // Simulated out-of-order delayed resolution: slow A resolves after fast B
  const committedStates: string[] = [];
  let releaseSlowA: (() => void) | undefined;

  const slowAId = guard.begin('uid_A');
  const slowAPromise = (async () => {
    await new Promise<void>((resolve) => {
      releaseSlowA = resolve;
    });
    const res = await resolveAdminPortalSession({
      user: { uid: 'uid_A', email: 'a@abk.edu', displayName: 'A' },
      checkBackendHealth: async () => false,
      fetchBackendSession: async () => {
        throw new Error('unused');
      },
      readIdTokenResult: async () => ({ claims: { abkRole: 'SUPER_ADMIN' } }),
      readOwnAdminDoc: async () => ({
        exists: () => true,
        data: () => ({ uid: 'uid_A', active: true, role: 'SUPER_ADMIN' }),
      }),
    });
    if (guard.isCurrent(slowAId, 'uid_A')) {
      committedStates.push(`A:${res.session?.uid}`);
    }
  })();

  const fastBId = guard.begin('uid_B');
  const resB = await resolveAdminPortalSession({
    user: { uid: 'uid_B', email: 'b@abk.edu', displayName: 'B' },
    checkBackendHealth: async () => false,
    fetchBackendSession: async () => {
      throw new Error('unused');
    },
    readIdTokenResult: async () => ({ claims: {} }),
    readOwnAdminDoc: async () => ({ exists: () => false, data: () => undefined }),
  });
  if (guard.isCurrent(fastBId, 'uid_B')) {
    committedStates.push(`B:${resB.diagnosis?.primaryReasonCode}`);
  }

  releaseSlowA?.();
  await slowAPromise;

  assert.deepEqual(committedStates, ['B:ADMIN_DOC_MISSING']);
});

test('formatGooglePopupErrorMessage produces clear Arabic errors for popup failures', () => {
  assert.match(
    formatGooglePopupErrorMessage({ code: 'auth/popup-closed-by-user' }),
    /إغلاق نافذة تسجيل الدخول/
  );
  assert.match(
    formatGooglePopupErrorMessage({ code: 'auth/popup-blocked' }),
    /حظر المتصفح النافذة المنبثقة/
  );
  assert.match(
    formatGooglePopupErrorMessage({ code: 'auth/cancelled-popup-request' }),
    /إلغاء محاولة تسجيل الدخول/
  );
  assert.match(
    formatGooglePopupErrorMessage({ code: 'auth/network-request-failed' }),
    /انقطاع الشبكة/
  );
});

test('resolveAdminPortalSession enforces backend 403, 401, and 500 errors without Client SDK override', async () => {
  let clientDocReadCount = 0;

  // 403: hard rejection even if local Client SDK claims & admins doc are SUPER_ADMIN
  const forbidden = await resolveAdminPortalSession({
    user: { uid: 'uid_admin', email: 'admin@abk.edu', displayName: 'Admin' },
    checkBackendHealth: async () => true,
    fetchBackendSession: async () => {
      throw Object.assign(new Error('الحساب موقوف من سياسة الخادم'), { status: 403 });
    },
    readIdTokenResult: async () => ({ claims: { abkRole: 'SUPER_ADMIN' } }),
    readOwnAdminDoc: async () => {
      clientDocReadCount += 1;
      return {
        exists: () => true,
        data: () => ({ uid: 'uid_admin', active: true, role: 'SUPER_ADMIN' }),
      };
    },
  });
  assert.equal(forbidden.session, null);
  assert.equal(forbidden.diagnosis?.allowed, false);
  assert.equal(forbidden.diagnosis?.primaryReasonCode, 'BACKEND_FORBIDDEN');
  assert.equal(forbidden.diagnosis?.primaryMessage, 'الحساب موقوف من سياسة الخادم');
  assert.equal(clientDocReadCount, 1);

  // 401: authentication problem — must NOT fall back to Client SDK session grant or Firestore check
  clientDocReadCount = 0;
  const unauthenticated = await resolveAdminPortalSession({
    user: { uid: 'uid_admin', email: 'admin@abk.edu', displayName: 'Admin' },
    checkBackendHealth: async () => true,
    fetchBackendSession: async () => {
      throw Object.assign(new Error('Invalid token'), { status: 401 });
    },
    readIdTokenResult: async () => ({ claims: { abkRole: 'SUPER_ADMIN' } }),
    readOwnAdminDoc: async () => {
      clientDocReadCount += 1;
      return {
        exists: () => true,
        data: () => ({ uid: 'uid_admin', active: true, role: 'SUPER_ADMIN' }),
      };
    },
  });
  assert.equal(unauthenticated.session, null);
  assert.equal(unauthenticated.diagnosis?.allowed, false);
  assert.equal(unauthenticated.diagnosis?.primaryReasonCode, 'BACKEND_UNAUTHENTICATED');
  assert.equal(unauthenticated.diagnosis?.adminDocCheck.status, 'SKIPPED_BACKEND_ERROR');
  assert.match(unauthenticated.diagnosis?.primaryMessage || '', /401/);
  assert.equal(clientDocReadCount, 0);

  // 500: explicit server error — must NOT fall back to Client SDK session grant
  const serverError = await resolveAdminPortalSession({
    user: { uid: 'uid_admin', email: 'admin@abk.edu', displayName: 'Admin' },
    checkBackendHealth: async () => true,
    fetchBackendSession: async () => {
      throw Object.assign(new Error('Database timeout'), { status: 500 });
    },
    readIdTokenResult: async () => ({ claims: { abkRole: 'SUPER_ADMIN' } }),
    readOwnAdminDoc: async () => {
      clientDocReadCount += 1;
      return {
        exists: () => true,
        data: () => ({ uid: 'uid_admin', active: true, role: 'SUPER_ADMIN' }),
      };
    },
  });
  assert.equal(serverError.session, null);
  assert.equal(serverError.diagnosis?.allowed, false);
  assert.equal(serverError.diagnosis?.primaryReasonCode, 'BACKEND_SERVER_ERROR');
  assert.equal(serverError.diagnosis?.adminDocCheck.status, 'SKIPPED_BACKEND_ERROR');
  assert.match(serverError.diagnosis?.primaryMessage || '', /500.*Database timeout/);
  assert.equal(clientDocReadCount, 0);

  // Static mode (backendUp=false): falls back cleanly to Client SDK check
  const staticGranted = await resolveAdminPortalSession({
    user: { uid: 'uid_admin', email: 'admin@abk.edu', displayName: 'Admin' },
    checkBackendHealth: async () => false,
    fetchBackendSession: async () => {
      throw new Error('should not be called');
    },
    readIdTokenResult: async () => ({ claims: { abkRole: 'SUPER_ADMIN' } }),
    readOwnAdminDoc: async () => {
      clientDocReadCount += 1;
      return {
        exists: () => true,
        data: () => ({ uid: 'uid_admin', active: true, role: 'SUPER_ADMIN' }),
      };
    },
  });
  assert.equal(staticGranted.session?.role, 'SUPER_ADMIN');
  assert.equal(staticGranted.session?.backendOnline, false);
  assert.equal(clientDocReadCount, 1);
});

test('SUPER_ADMIN console bootstrap doc without Custom Claim is accepted, hidden whitespace/Unicode chars are normalized with warning, and UID mismatch is rejected', async () => {
  // 1. Clean owner bootstrap document with NO Custom Claim (abkRole missing)
  const cleanOwnerSession = await resolveAdminPortalSession({
    user: {
      uid: '5bIqNT2H3pVniVd6ULYkwps55c43',
      email: 'karimaeti07@gmail.com',
      displayName: 'Owner',
    },
    checkBackendHealth: async () => false,
    fetchBackendSession: async () => {
      throw new Error('unused');
    },
    readIdTokenResult: async () => ({ claims: {} }),
    readOwnAdminDoc: async (targetUid) => ({
      exists: () => true,
      data: () => ({
        uid: targetUid,
        email: 'karimaeti07@gmail.com',
        role: 'SUPER_ADMIN',
        active: true,
        grantedBy: 'FIREBASE_CONSOLE_BOOTSTRAP',
      }),
    }),
  });
  assert.equal(cleanOwnerSession.session?.role, 'SUPER_ADMIN');
  assert.equal(cleanOwnerSession.session?.uid, '5bIqNT2H3pVniVd6ULYkwps55c43');
  assert.equal(cleanOwnerSession.diagnosis?.allowed, true);
  assert.equal(cleanOwnerSession.diagnosis?.adminDocCheck.status, 'VALID_ACTIVE');
  assert.deepEqual(cleanOwnerSession.session?.warnings, []);

  // 2. Role pasted from mobile browser with trailing space and RTL/zero-width invisible markers
  const formattedRoleSession = await resolveAdminPortalSession({
    user: {
      uid: '5bIqNT2H3pVniVd6ULYkwps55c43',
      email: 'karimaeti07@gmail.com',
    },
    checkBackendHealth: async () => false,
    fetchBackendSession: async () => {
      throw new Error('unused');
    },
    readIdTokenResult: async () => ({ claims: {} }),
    readOwnAdminDoc: async (targetUid) => ({
      exists: () => true,
      data: () => ({
        uid: targetUid,
        email: 'karimaeti07@gmail.com',
        role: ' \u200FSUPER\u200B_ADMIN\u00A0 ' as unknown as 'SUPER_ADMIN',
        active: true,
        grantedBy: 'FIREBASE_CONSOLE_BOOTSTRAP',
      }),
    }),
  });
  assert.equal(formattedRoleSession.session?.role, 'SUPER_ADMIN');
  assert.equal(formattedRoleSession.diagnosis?.allowed, true);
  assert.equal(formattedRoleSession.diagnosis?.adminDocCheck.hasRoleFormattingArtifacts, true);
  assert.equal((formattedRoleSession.session?.warnings?.length || 0) > 0, true);

  // 3. UID mismatch or missing UID in /admins/{uid} must be strictly rejected
  const uidMismatchSession = await resolveAdminPortalSession({
    user: {
      uid: '5bIqNT2H3pVniVd6ULYkwps55c43',
      email: 'karimaeti07@gmail.com',
    },
    checkBackendHealth: async () => false,
    fetchBackendSession: async () => {
      throw new Error('unused');
    },
    readIdTokenResult: async () => ({ claims: {} }),
    readOwnAdminDoc: async () => ({
      exists: () => true,
      data: () => ({
        uid: 'different_uid_value',
        email: 'karimaeti07@gmail.com',
        role: 'SUPER_ADMIN',
        active: true,
      }),
    }),
  });
  assert.equal(uidMismatchSession.session, null);
  assert.equal(uidMismatchSession.diagnosis?.allowed, false);
  assert.equal(uidMismatchSession.diagnosis?.primaryReasonCode, 'ADMIN_DOC_UID_MISMATCH');
  assert.equal(uidMismatchSession.diagnosis?.adminDocCheck.status, 'UID_MISMATCH');

  const missingUidResult = resolveFrontendStaffRole({
    uid: '5bIqNT2H3pVniVd6ULYkwps55c43',
    claims: {},
    adminDoc: { role: 'SUPER_ADMIN', active: true },
  });
  assert.equal(missingUidResult, null);

  // 4. Invisible/non-ASCII characters in invalid roles are visualized explicitly for diagnostics
  assert.equal(normalizeStaffRole('SUPER_ADMIN\u200F '), 'SUPER_ADMIN');
  assert.equal(normalizeStaffRole('STUDENT'), null);
  assert.equal(formatRawValueForDiagnostics('SUPER_ADMIN\u200F '), 'SUPER_ADMIN[U+200F]·');
});



