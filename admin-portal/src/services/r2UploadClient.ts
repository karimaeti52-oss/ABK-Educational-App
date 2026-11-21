import { firebaseAuth } from '../firebase';
import type { PlatformConfig, R2QuotaStatus } from '../types';
import {
  buildFileFingerprint,
  clearSavedUploadSession,
  executeResumableR2Upload,
  loadSavedUploadSession,
  normalizeR2WorkerBaseUrl,
  R2UploadError,
  resolveR2StorageLimits,
  type R2UploadProgress,
  type R2UploadResult,
} from '../utils/r2Upload';

const viteEnv: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export function resolveActiveR2WorkerUrl(platformConfig?: Partial<PlatformConfig> | null): string {
  return (
    normalizeR2WorkerBaseUrl(platformConfig?.r2WorkerBaseUrl) ||
    normalizeR2WorkerBaseUrl(viteEnv.VITE_R2_WORKER_URL) ||
    ''
  );
}

async function getCurrentIdToken(): Promise<string> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new R2UploadError('UNAUTHENTICATED', 'يرجى تسجيل الدخول بحساب مشرف معتمد أولاً.', false);
  }
  return await user.getIdToken();
}

export async function fetchR2QuotaStatus(
  platformConfig?: Partial<PlatformConfig> | null
): Promise<R2QuotaStatus | null> {
  const baseUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!baseUrl) return null;
  const token = await getCurrentIdToken();
  const res = await fetch(`${baseUrl}/quota`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `تعذر جلب حالة مساحة R2 (HTTP ${res.status})`);
  }
  return (await res.json()) as R2QuotaStatus;
}

export async function deleteR2ObjectIfConfigured(
  objectKey: string | undefined | null,
  platformConfig?: Partial<PlatformConfig> | null
): Promise<boolean> {
  if (!objectKey) return false;
  const baseUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!baseUrl) return false;
  const token = await getCurrentIdToken();
  const res = await fetch(`${baseUrl}/object?key=${encodeURIComponent(objectKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export function checkSavedResumableR2Session(file: File, folderPath: string) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return loadSavedUploadSession(window.localStorage, buildFileFingerprint(file, folderPath));
}

export async function abortSavedResumableR2Session(
  file: File,
  folderPath: string,
  platformConfig?: Partial<PlatformConfig> | null
): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const fp = buildFileFingerprint(file, folderPath);
  const saved = loadSavedUploadSession(window.localStorage, fp);
  clearSavedUploadSession(window.localStorage, fp);
  if (!saved) return;

  const baseUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!baseUrl || !firebaseAuth.currentUser) return;
  try {
    const token = await firebaseAuth.currentUser.getIdToken();
    await fetch(
      `${baseUrl}/multipart/abort?key=${encodeURIComponent(saved.objectKey)}&uploadId=${encodeURIComponent(saved.uploadId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    // Best-effort server abort cleanup
  }
}

export interface ActiveR2UploadController {
  promise: Promise<R2UploadResult>;
  pause: () => void;
  cancel: () => Promise<void>;
}

export function startR2ResumableUpload(
  file: File,
  folderPath: string,
  options: {
    platformConfig?: Partial<PlatformConfig> | null;
    quotaStatus?: R2QuotaStatus | null;
    imageOnly?: boolean;
    videoOnly?: boolean;
    onProgress?: (progress: R2UploadProgress) => void;
  } = {}
): ActiveR2UploadController {
  const abortController = new AbortController();
  let pausedFlag = false;

  const promise = executeResumableR2Upload({
    workerBaseUrl: resolveActiveR2WorkerUrl(options.platformConfig),
    file,
    folder: folderPath,
    getAuthToken: getCurrentIdToken,
    limits: resolveR2StorageLimits(options.platformConfig),
    quotaStatus: options.quotaStatus,
    imageOnly: options.imageOnly,
    videoOnly: options.videoOnly,
    signal: abortController.signal,
    pauseController: { isPaused: () => pausedFlag },
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    onProgress: options.onProgress,
  });

  return {
    promise,
    pause: () => {
      pausedFlag = true;
    },
    cancel: async () => {
      abortController.abort();
      await abortSavedResumableR2Session(file, folderPath, options.platformConfig);
    },
  };
}
