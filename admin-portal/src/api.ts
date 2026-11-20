import { firebaseAuth } from './firebase';
import type { AdminEntry, AuthUserRecord, StaffRole, UserAccountStatus } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'يرجى تسجيل الدخول أولاً.');
  const token = await user.getIdToken();

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error || 'API_ERROR',
      body.message || 'تعذر تنفيذ الطلب عبر الخادم الموثوق.'
    );
  }
  return body as T;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchBackendSession() {
  return apiFetch<{
    uid: string;
    email: string;
    name: string;
    role: StaffRole;
    permissions: string[];
    teacherId?: string | null;
    authTime: number;
    mfaVerified: boolean;
  }>('/api/auth/me');
}

export async function listAdminsViaBackend(): Promise<AdminEntry[]> {
  const data = await apiFetch<{ admins: AdminEntry[] }>('/api/admins');
  return data.admins;
}

export async function grantStaffRoleViaBackend(payload: {
  email: string;
  role: StaffRole;
  permissions?: string[];
  teacherId?: string;
  active?: boolean;
}) {
  return apiFetch<{ ok: boolean; uid: string; role: StaffRole }>('/api/admins/grant', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function revokeStaffRoleViaBackend(uid: string) {
  return apiFetch<{ ok: boolean }>('/api/admins/revoke', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
}

export async function fetchUsersViaBackend(): Promise<AuthUserRecord[]> {
  const data = await apiFetch<{ users: AuthUserRecord[] }>('/api/users');
  return data.users;
}

export async function updateUserStatusViaBackend(
  uid: string,
  accountStatus: UserAccountStatus,
  reason?: string
) {
  return apiFetch<{ ok: boolean; accountStatus: UserAccountStatus; disabled: boolean }>(
    `/api/users/${encodeURIComponent(uid)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus, reason: reason?.trim() || undefined }),
    }
  );
}

export async function deleteUserViaBackend(uid: string, confirmTarget: string) {
  return apiFetch<{ ok: boolean; deletedDocsCount: number }>(
    `/api/users/${encodeURIComponent(uid)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ confirmTarget }),
    }
  );
}

export async function exportFullBackupViaBackend() {
  return apiFetch<Record<string, unknown>>('/api/backups/export');
}

export async function restoreBackupViaBackend(backupPayload: unknown) {
  return apiFetch<{ ok: boolean; restoredCount: number }>('/api/backups/restore', {
    method: 'POST',
    body: JSON.stringify(backupPayload),
  });
}
