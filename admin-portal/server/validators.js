import { z } from 'zod';
import { ALL_PERMISSIONS, STAFF_ROLES } from './rbac.js';

export const GrantAdminSchema = z.object({
  email: z.string().trim().email('البريد الإلكتروني غير صالح').max(160),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'TEACHER', 'VIEWER']),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).max(30).optional(),
  teacherId: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional().or(z.literal('')),
  active: z.boolean().optional().default(true),
});

export const RevokeAdminSchema = z.object({
  uid: z.string().trim().min(1).max(128),
});

export const UpdateUserStatusSchema = z.object({
  accountStatus: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const AuditLogSchema = z.object({
  action: z.string().trim().min(1).max(80),
  entityType: z.string().trim().min(1).max(80),
  entityId: z.string().trim().max(128).optional().default(''),
  summary: z.string().trim().max(500).optional().default(''),
});

export const BACKUP_COLLECTIONS = [
  'platformConfig',
  'catalogNodes',
  'subjects',
  'units',
  'teachers',
  'lessons',
  'lessonExplanations',
  'contentBlocks',
  'customSectionTypes',
  'materials',
  'announcements',
];

export const BackupPayloadSchema = z.object({
  version: z.literal('abk-backup-v1'),
  exportedAt: z.string().min(1),
  databaseId: z.string().min(1),
  collections: z.record(
    z.enum(BACKUP_COLLECTIONS),
    z.array(
      z.object({
        id: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,128}$/),
        data: z.record(z.unknown()),
      })
    ).max(5000)
  ),
});

export function validateSafeMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isAllowedStaffRole(role) {
  return STAFF_ROLES.includes(role);
}
