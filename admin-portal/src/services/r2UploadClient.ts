import { firebaseAuth } from '../firebase';
import type { MediaAccessLevel, PlatformConfig, R2QuotaStatus, StorageProviderId } from '../types';
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
    throw new Error(json.error || `تعذر التحقق من حساب التخزين (HTTP ${res.status})`);
  }
  const raw = (await res.json()) as Partial<R2QuotaStatus>;
  const r2Bound = raw.r2Bound === true;
  const verified = raw.verified === true && r2Bound;
  return {
    provider: 'cloudflare-r2',
    verified,
    r2Bound,
    usedBytes: Number(raw.usedBytes || 0),
    totalLimitBytes: Number(raw.totalLimitBytes || 0),
    targetTotalBytes: raw.targetTotalBytes !== undefined ? Number(raw.targetTotalBytes) : undefined,
    remainingBytes: Number(raw.remainingBytes || 0),
    fileCount: Number(raw.fileCount || 0),
    usedPercent: Number(raw.usedPercent || 0),
    nearLimit: Boolean(raw.nearLimit),
    limits: raw.limits || resolveR2StorageLimits(platformConfig),
    r2: raw.r2,
    b2: raw.b2,
  };
}

export function inferStorageProviderFromUrl(
  fileUrl?: string | null,
  explicitProvider?: StorageProviderId
): StorageProviderId {
  if (explicitProvider === 'b2') return 'b2';
  if (fileUrl && fileUrl.includes('/b2/files/')) return 'b2';
  return 'r2';
}

export async function deleteR2ObjectIfConfigured(
  objectKey: string | undefined | null,
  platformConfig?: Partial<PlatformConfig> | null,
  provider?: StorageProviderId,
  fileUrl?: string | null
): Promise<boolean> {
  if (!objectKey) return false;
  const baseUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!baseUrl) return false;
  const targetProvider = inferStorageProviderFromUrl(fileUrl, provider);
  const token = await getCurrentIdToken();
  const res = await fetch(
    `${baseUrl}/object?key=${encodeURIComponent(objectKey)}&provider=${targetProvider}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.ok;
}

export function checkSavedResumableR2Session(
  file: File,
  folderPath: string,
  storageProvider: StorageProviderId = 'r2'
) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return loadSavedUploadSession(
    window.localStorage,
    buildFileFingerprint(file, folderPath, storageProvider)
  );
}

export async function abortSavedResumableR2Session(
  file: File,
  folderPath: string,
  platformConfig?: Partial<PlatformConfig> | null,
  storageProvider: StorageProviderId = 'r2'
): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const fp = buildFileFingerprint(file, folderPath, storageProvider);
  const saved = loadSavedUploadSession(window.localStorage, fp);
  clearSavedUploadSession(window.localStorage, fp);
  if (!saved) return;

  const baseUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!baseUrl || !firebaseAuth.currentUser) return;
  try {
    const token = await firebaseAuth.currentUser.getIdToken();
    const resolvedProvider = saved.storageProvider === 'b2' ? 'b2' : storageProvider;
    await fetch(
      `${baseUrl}/multipart/abort?key=${encodeURIComponent(saved.objectKey)}&uploadId=${encodeURIComponent(saved.uploadId)}&provider=${resolvedProvider}`,
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
    storageProvider?: StorageProviderId;
    accessLevel?: MediaAccessLevel;
    imageOnly?: boolean;
    videoOnly?: boolean;
    onProgress?: (progress: R2UploadProgress) => void;
  } = {}
): ActiveR2UploadController {
  const abortController = new AbortController();
  const storageProvider: StorageProviderId = options.storageProvider === 'b2' ? 'b2' : 'r2';
  let pausedFlag = false;

  const promise = executeResumableR2Upload({
    workerBaseUrl: resolveActiveR2WorkerUrl(options.platformConfig),
    file,
    folder: folderPath,
    getAuthToken: getCurrentIdToken,
    storageProvider,
    accessLevel: options.accessLevel,
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
      await abortSavedResumableR2Session(file, folderPath, options.platformConfig, storageProvider);
    },
  };
}
