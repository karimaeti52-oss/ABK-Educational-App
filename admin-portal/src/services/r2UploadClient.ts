import { firebaseAuth } from '../firebase';
import type { MediaAccessLevel, PlatformConfig, R2QuotaStatus, StorageProviderId } from '../types';
import {
  buildFileFingerprint,
  clearSavedUploadSession,
  executeResumableR2Upload,
  fetchJsonOrThrow,
  loadSavedUploadSession,
  R2UploadError,
  resolveR2StorageLimits,
  validateR2WorkerBaseUrlInput,
  verifyWorkerHealth,
  type R2UploadProgress,
  type R2UploadResult,
  type WorkerHealthCheckResult,
  type WorkerUrlValidationResult,
} from '../utils/r2Upload';

const viteEnv: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

let cachedLiveQuota: { baseUrl: string; data: R2QuotaStatus; fetchedAt: number } | null = null;
let cachedWorkerHealth: { baseUrl: string; data: WorkerHealthCheckResult; fetchedAt: number } | null = null;
const QUOTA_CACHE_TTL_MS = 60_000;

export function resolveActiveR2WorkerUrlStatus(
  platformConfig?: Partial<PlatformConfig> | null
): WorkerUrlValidationResult {
  const fromConfigRaw = platformConfig?.r2WorkerBaseUrl;
  if (typeof fromConfigRaw === 'string' && fromConfigRaw.trim().length > 0) {
    return validateR2WorkerBaseUrlInput(fromConfigRaw);
  }
  const fromEnvRaw = viteEnv.VITE_R2_WORKER_URL;
  if (typeof fromEnvRaw === 'string' && fromEnvRaw.trim().length > 0) {
    return validateR2WorkerBaseUrlInput(fromEnvRaw);
  }
  return validateR2WorkerBaseUrlInput('');
}

export function resolveActiveR2WorkerUrl(platformConfig?: Partial<PlatformConfig> | null): string {
  return resolveActiveR2WorkerUrlStatus(platformConfig).normalizedUrl;
}

export function peekCachedR2QuotaStatus(
  platformConfig?: Partial<PlatformConfig> | null
): R2QuotaStatus | null {
  if (!cachedLiveQuota) return null;
  const activeUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!activeUrl || cachedLiveQuota.baseUrl !== activeUrl) {
    return null;
  }
  if (Date.now() - cachedLiveQuota.fetchedAt > QUOTA_CACHE_TTL_MS) {
    return null;
  }
  return cachedLiveQuota.data;
}

export function peekCachedWorkerHealthStatus(
  platformConfig?: Partial<PlatformConfig> | null
): WorkerHealthCheckResult | null {
  if (!cachedWorkerHealth) return null;
  const activeUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!activeUrl || cachedWorkerHealth.baseUrl !== activeUrl) {
    return null;
  }
  if (Date.now() - cachedWorkerHealth.fetchedAt > QUOTA_CACHE_TTL_MS) {
    return null;
  }
  return cachedWorkerHealth.data;
}

export function clearCachedR2QuotaStatus(): void {
  cachedLiveQuota = null;
  cachedWorkerHealth = null;
}

export async function fetchWorkerHealthStatus(
  platformConfig?: Partial<PlatformConfig> | null
): Promise<WorkerHealthCheckResult | null> {
  const urlStatus = resolveActiveR2WorkerUrlStatus(platformConfig);
  if (!urlStatus.valid) {
    return null;
  }
  const cached = peekCachedWorkerHealthStatus(platformConfig);
  if (cached) return cached;

  const baseUrl = urlStatus.normalizedUrl;
  const health = await verifyWorkerHealth({ workerBaseUrl: baseUrl });
  cachedWorkerHealth = { baseUrl, data: health, fetchedAt: Date.now() };
  return health;
}

export function resolvePreferredStorageProvider(
  quotaStatus?: R2QuotaStatus | null,
  healthStatus?: WorkerHealthCheckResult | null,
  fallback: StorageProviderId = 'b2'
): StorageProviderId {
  if (quotaStatus) {
    if (quotaStatus.primaryProvider === 'b2' && quotaStatus.b2?.enabled) return 'b2';
    if (quotaStatus.b2?.enabled && quotaStatus.b2?.verified) return 'b2';
    if (quotaStatus.r2Bound && quotaStatus.r2?.verified !== false) return 'r2';
  }
  if (healthStatus) {
    if (healthStatus.primaryProvider === 'b2' && healthStatus.b2Enabled) return 'b2';
    if (healthStatus.b2Enabled) return 'b2';
    if (healthStatus.r2Bound) return 'r2';
  }
  return fallback;
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
  const urlStatus = resolveActiveR2WorkerUrlStatus(platformConfig);
  if (!urlStatus.valid) {
    if (urlStatus.reason === 'EMPTY') {
      return null;
    }
    throw new R2UploadError('WORKER_INVALID_URL', urlStatus.errorMessage!, false);
  }

  const baseUrl = urlStatus.normalizedUrl;
  // Step 1: Verify Worker HTTP /health + active storage provider (B2 and/or R2)
  const health = await verifyWorkerHealth({ workerBaseUrl: baseUrl });
  cachedWorkerHealth = { baseUrl, data: health, fetchedAt: Date.now() };

  // Step 2: Authenticated live quota check against Backblaze B2 & Cloudflare R2
  const token = await getCurrentIdToken();
  const raw = (await fetchJsonOrThrow(
    fetch,
    `${baseUrl}/quota`,
    { headers: { Authorization: `Bearer ${token}` } },
    20_000
  )) as Partial<R2QuotaStatus>;

  const r2Bound = raw.r2Bound === true;
  const b2Verified = Boolean(raw.b2?.enabled && raw.b2?.verified);
  const b2Bound = raw.b2Bound === true || Boolean(raw.b2?.workerConfigured) || b2Verified;
  const r2Verified = Boolean(r2Bound && (raw.r2 ? raw.r2.verified : raw.verified));
  const verified = Boolean(b2Verified || r2Verified || (raw.verified === true && r2Bound));
  const primaryProvider: StorageProviderId =
    raw.primaryProvider === 'b2' || (b2Verified && !r2Verified)
      ? 'b2'
      : raw.primaryProvider === 'r2'
        ? 'r2'
        : b2Verified
          ? 'b2'
          : 'r2';

  const parsedQuota: R2QuotaStatus = {
    provider: primaryProvider === 'b2' ? 'backblaze-b2' : 'cloudflare-r2',
    primaryProvider,
    verified,
    r2Bound,
    b2Bound,
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
  cachedLiveQuota = { baseUrl, data: parsedQuota, fetchedAt: Date.now() };
  return parsedQuota;
}

export function inferStorageProviderFromUrl(
  fileUrl?: string | null,
  explicitProvider?: StorageProviderId
): StorageProviderId {
  if (explicitProvider === 'b2') return 'b2';
  if (explicitProvider === 'r2') return 'r2';
  if (fileUrl && fileUrl.includes('/b2/files/')) return 'b2';
  if (fileUrl && fileUrl.includes('/files/')) return 'r2';
  return 'b2';
}

export async function fetchSignedB2Url({
  objectKey,
  fileUrl,
  platformConfig,
  download = false,
  expiresInSec = 300,
}: {
  objectKey?: string | null;
  fileUrl?: string | null;
  platformConfig?: Partial<PlatformConfig> | null;
  download?: boolean;
  expiresInSec?: number;
}): Promise<string | null> {
  const baseUrl = resolveActiveR2WorkerUrl(platformConfig);
  if (!baseUrl || (!objectKey && !fileUrl)) return null;
  const token = await getCurrentIdToken();
  const params = new URLSearchParams();
  if (objectKey) params.set('key', objectKey);
  else if (fileUrl) params.set('url', fileUrl);
  if (download) params.set('download', '1');
  if (expiresInSec) params.set('expiresIn', String(expiresInSec));

  const res = await fetchJsonOrThrow(
    fetch,
    `${baseUrl}/b2/signed-url?${params.toString()}`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    15_000
  );
  return typeof res.signedUrl === 'string' && res.signedUrl.trim() ? res.signedUrl.trim() : null;
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
  storageProvider: StorageProviderId = 'b2'
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
  storageProvider: StorageProviderId = 'b2'
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
    const resolvedProvider =
      saved.storageProvider === 'b2' || saved.storageProvider === 'r2'
        ? saved.storageProvider
        : storageProvider;
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
  const effectiveQuota = options.quotaStatus ?? peekCachedR2QuotaStatus(options.platformConfig);
  const effectiveHealth = peekCachedWorkerHealthStatus(options.platformConfig);
  const storageProvider: StorageProviderId =
    options.storageProvider ?? resolvePreferredStorageProvider(effectiveQuota, effectiveHealth, 'b2');
  let pausedFlag = false;
  const urlStatus = resolveActiveR2WorkerUrlStatus(options.platformConfig);

  const promise = urlStatus.valid
    ? executeResumableR2Upload({
        workerBaseUrl: urlStatus.normalizedUrl,
        file,
        folder: folderPath,
        getAuthToken: getCurrentIdToken,
        storageProvider,
        accessLevel: options.accessLevel,
        limits: resolveR2StorageLimits(options.platformConfig),
        quotaStatus: effectiveQuota,
        imageOnly: options.imageOnly,
        videoOnly: options.videoOnly,
        signal: abortController.signal,
        pauseController: { isPaused: () => pausedFlag },
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        onProgress: options.onProgress,
      })
    : Promise.reject(
        new R2UploadError(
          urlStatus.reason === 'EMPTY' ? 'WORKER_NOT_CONFIGURED' : 'WORKER_INVALID_URL',
          urlStatus.errorMessage!,
          false
        )
      );

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
