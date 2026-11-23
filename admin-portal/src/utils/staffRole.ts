import type { AdminEntry, StaffRole } from '../types';

export const VALID_STAFF_ROLES = new Set<StaffRole>([
  'SUPER_ADMIN',
  'ADMIN',
  'CONTENT_MANAGER',
  'TEACHER',
  'VIEWER',
]);

export interface FrontendStaffRoleResult {
  role: StaffRole;
  permissions: string[];
  teacherId: string | null;
}

export function resolveFrontendStaffRole({
  claims,
  adminDoc,
}: {
  claims: Record<string, unknown> | null | undefined;
  adminDoc: Partial<AdminEntry> | null | undefined;
}): FrontendStaffRoleResult | null {
  if (adminDoc && adminDoc.active === false) {
    throw new Error('تم تعطيل صلاحية هذا الحساب الإداري.');
  }

  const rawClaimRole = typeof claims?.abkRole === 'string' ? claims.abkRole : undefined;
  const validClaimRole =
    rawClaimRole && VALID_STAFF_ROLES.has(rawClaimRole as StaffRole)
      ? (rawClaimRole as StaffRole)
      : undefined;

  let adminDocRole: StaffRole | undefined;
  let adminPermissions: string[] = [];
  let docTeacherId: string | null = null;

  // Enforce strict active === true and an explicit role within VALID_STAFF_ROLES
  if (adminDoc && adminDoc.active === true) {
    const rawDocRole = adminDoc.role;
    if (typeof rawDocRole === 'string' && VALID_STAFF_ROLES.has(rawDocRole as StaffRole)) {
      adminDocRole = rawDocRole as StaffRole;
      adminPermissions = Array.isArray(adminDoc.permissions)
        ? adminDoc.permissions.filter((p): p is string => typeof p === 'string')
        : [];
      docTeacherId =
        typeof adminDoc.teacherId === 'string' && adminDoc.teacherId ? adminDoc.teacherId : null;
    }
  }

  const resolvedRole: StaffRole | null = validClaimRole || adminDocRole || null;
  if (!resolvedRole) {
    return null;
  }

  const claimPermissions = Array.isArray(claims?.abkPermissions)
    ? (claims.abkPermissions as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  const claimTeacherId =
    typeof claims?.teacherId === 'string' && claims.teacherId ? claims.teacherId : null;

  return {
    role: resolvedRole,
    permissions: adminPermissions.length > 0 ? adminPermissions : claimPermissions,
    teacherId: docTeacherId || claimTeacherId,
  };
}
