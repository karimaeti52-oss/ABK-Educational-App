export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'CONTENT_MANAGER',
  'TEACHER',
  'VIEWER',
];

export const PERMISSIONS = {
  MANAGE_CATALOG: 'manage_catalog',
  MANAGE_SUBJECTS: 'manage_subjects',
  MANAGE_LESSONS: 'manage_lessons',
  MANAGE_TEACHERS: 'manage_teachers',
  MANAGE_BLOCKS: 'manage_blocks',
  MANAGE_MATERIALS: 'manage_materials',
  MANAGE_ANNOUNCEMENTS: 'manage_announcements',
  MANAGE_USERS: 'manage_users',
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_BRANDING: 'manage_branding',
  VIEW_AUDIT: 'view_audit',
  MANAGE_BACKUPS: 'manage_backups',
  MANAGE_SETTINGS: 'manage_settings',
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: [
    PERMISSIONS.MANAGE_CATALOG,
    PERMISSIONS.MANAGE_SUBJECTS,
    PERMISSIONS.MANAGE_LESSONS,
    PERMISSIONS.MANAGE_TEACHERS,
    PERMISSIONS.MANAGE_BLOCKS,
    PERMISSIONS.MANAGE_MATERIALS,
    PERMISSIONS.MANAGE_ANNOUNCEMENTS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_BRANDING,
    PERMISSIONS.VIEW_AUDIT,
    PERMISSIONS.MANAGE_SETTINGS,
  ],
  CONTENT_MANAGER: [
    PERMISSIONS.MANAGE_CATALOG,
    PERMISSIONS.MANAGE_SUBJECTS,
    PERMISSIONS.MANAGE_LESSONS,
    PERMISSIONS.MANAGE_TEACHERS,
    PERMISSIONS.MANAGE_BLOCKS,
    PERMISSIONS.MANAGE_MATERIALS,
    PERMISSIONS.MANAGE_ANNOUNCEMENTS,
    PERMISSIONS.VIEW_AUDIT,
  ],
  TEACHER: [PERMISSIONS.MANAGE_BLOCKS],
  VIEWER: [PERMISSIONS.VIEW_AUDIT],
};

export function resolveEffectiveRole(decodedToken, adminDoc, superAdminEmail = '') {
  const email = (decodedToken?.email || '').trim().toLowerCase();
  const emailVerified = Boolean(decodedToken?.email_verified);
  const configuredSuperEmail = String(superAdminEmail || '').trim().toLowerCase();

  if (configuredSuperEmail && emailVerified && email === configuredSuperEmail) {
    return 'SUPER_ADMIN';
  }

  if (adminDoc && adminDoc.active === false) {
    return 'STUDENT';
  }

  const claimRole = decodedToken?.abkRole;
  if (typeof claimRole === 'string' && STAFF_ROLES.includes(claimRole)) {
    return claimRole;
  }

  if (adminDoc && adminDoc.active === true) {
    const docRole = adminDoc.role;
    if (typeof docRole === 'string' && STAFF_ROLES.includes(docRole)) {
      return docRole;
    }
  }

  return 'STUDENT';
}

export function resolveEffectivePermissions(role, decodedToken, adminDoc) {
  if (!STAFF_ROLES.includes(role)) return [];
  if (role === 'SUPER_ADMIN') return [...ALL_PERMISSIONS];

  const customPerms = Array.isArray(decodedToken?.abkPermissions)
    ? decodedToken.abkPermissions
    : Array.isArray(adminDoc?.permissions) && adminDoc.permissions.length > 0
      ? adminDoc.permissions
      : null;

  if (customPerms) {
    return customPerms.filter((p) => ALL_PERMISSIONS.includes(p));
  }
  return [...(ROLE_DEFAULT_PERMISSIONS[role] || [])];
}

export function hasPermission(staffContext, permission) {
  if (!staffContext || !STAFF_ROLES.includes(staffContext.role)) return false;
  if (staffContext.role === 'SUPER_ADMIN') return true;
  return Array.isArray(staffContext.permissions) && staffContext.permissions.includes(permission);
}

export function isRecentAuth(decodedToken, maxAgeSeconds = 1800, nowSeconds = Math.floor(Date.now() / 1000)) {
  const authTime = Number(decodedToken?.auth_time || 0);
  if (!authTime || Number.isNaN(authTime)) return false;
  return nowSeconds - authTime <= maxAgeSeconds;
}
