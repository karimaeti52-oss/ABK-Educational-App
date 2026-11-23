import type {
  B2QuotaStatus,
  MediaAccessLevel,
  MediaKind,
  MultiProviderStorageSummary,
  PlatformConfig,
  R2QuotaStatus,
  R2StorageLimits,
  StorageProviderId,
} from '../types.ts';

export const DEFAULT_R2_LIMITS: R2StorageLimits = {
  maxVideoSizeMb: 200,
  maxPdfSizeMb: 100,
  maxImageSizeMb: 20,
  r2StorageLimitGb: 10,
  b2StorageLimitGb: 10,
  b2Enabled: false,
  totalStorageLimitGb: 10,
};

export const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const PERMANENT_MIDAD_APK_URL =
  'https://github.com/karimaeti52-oss/ABK-Educational-App/releases/latest/download/Midad.apk';

export type R2UploadErrorCode =
  | 'WORKER_NOT_CONFIGURED'
  | 'UNAUTHENTICATED'
  | 'INVALID_TYPE'
  | 'FILE_TOO_LARGE'
  | 'QUOTA_EXCEEDED'
  | 'CANCELED'
  | 'PAUSED'
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export class R2UploadError extends Error {
  code: R2UploadErrorCode;
  retryable: boolean;

  constructor(code: R2UploadErrorCode, message: string, retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface UploadedPartRecord {
  partNumber: number;
  etag: string;
}

export interface ResumableUploadSession {
  fingerprint: string;
  fileName: string;
  sizeBytes: number;
  folder: string;
  storageProvider?: StorageProviderId;
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  totalParts: number;
  uploadedParts: UploadedPartRecord[];
  updatedAt: number;
}

export interface R2UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  currentPart: number;
  totalParts: number;
  phase: 'checking' | 'uploading' | 'completing' | 'paused';
}

export interface R2UploadResult {
  url: string;
  objectKey: string;
  storageProvider: StorageProviderId;
  accessLevel: MediaAccessLevel;
  sizeBytes: number;
  sizeLabel: string;
  contentType: string;
  mediaKind: MediaKind;
  fileName: string;
}

export interface SessionStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, val: string) => void;
  removeItem: (key: string) => void;
}

const EXT_INFO: Record<string, { mediaKind: MediaKind; contentType: string }> = {
  mp4: { mediaKind: 'VIDEO', contentType: 'video/mp4' },
  m4v: { mediaKind: 'VIDEO', contentType: 'video/mp4' },
  webm: { mediaKind: 'VIDEO', contentType: 'video/webm' },
  pdf: { mediaKind: 'PDF', contentType: 'application/pdf' },
  png: { mediaKind: 'IMAGE', contentType: 'image/png' },
  jpg: { mediaKind: 'IMAGE', contentType: 'image/jpeg' },
  jpeg: { mediaKind: 'IMAGE', contentType: 'image/jpeg' },
  webp: { mediaKind: 'IMAGE', contentType: 'image/webp' },
  zip: { mediaKind: 'ATTACHMENT', contentType: 'application/zip' },
  txt: { mediaKind: 'ATTACHMENT', contentType: 'text/plain' },
  doc: { mediaKind: 'ATTACHMENT', contentType: 'application/msword' },
  docx: {
    mediaKind: 'ATTACHMENT',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  pptx: {
    mediaKind: 'ATTACHMENT',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
};

export function resolveR2StorageLimits(config?: Partial<PlatformConfig> | null): R2StorageLimits {
  const clamp = (val: unknown, fallback: number, min: number, max: number) => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  const r2StorageLimitGb = clamp(config?.r2StorageLimitGb, DEFAULT_R2_LIMITS.r2StorageLimitGb, 1, 500);
  const b2StorageLimitGb = clamp(config?.b2StorageLimitGb, DEFAULT_R2_LIMITS.b2StorageLimitGb, 0, 500);
  const b2Enabled = config?.b2Enabled === true;
  // Active quota defaults strictly to R2 alone (10 GB) unless Backblaze B2 is also enabled.
  const totalStorageLimitGb = b2Enabled ? r2StorageLimitGb + b2StorageLimitGb : r2StorageLimitGb;

  return {
    maxVideoSizeMb: clamp(config?.maxVideoSizeMb, DEFAULT_R2_LIMITS.maxVideoSizeMb, 1, 2048),
    maxPdfSizeMb: clamp(config?.maxPdfSizeMb, DEFAULT_R2_LIMITS.maxPdfSizeMb, 1, 1024),
    maxImageSizeMb: clamp(config?.maxImageSizeMb, DEFAULT_R2_LIMITS.maxImageSizeMb, 1, 256),
    r2StorageLimitGb,
    b2StorageLimitGb,
    b2Enabled,
    totalStorageLimitGb,
  };
}

const GIB = 1024 * 1024 * 1024;

export function buildMultiProviderStorageSummary(options: {
  limits: R2StorageLimits;
  r2Quota?: R2QuotaStatus | null;
  b2Status?: B2QuotaStatus | null;
}): MultiProviderStorageSummary {
  const { limits, r2Quota, b2Status } = options;

  const r2AllocatedBytes = limits.r2StorageLimitGb * GIB;
  const r2Verified = Boolean(
    r2Quota &&
      r2Quota.verified === true &&
      r2Quota.r2Bound !== false &&
      (r2Quota.r2 ? r2Quota.r2.verified === true : Number.isFinite(r2Quota.totalLimitBytes) && r2Quota.totalLimitBytes > 0)
  );
  const r2ActiveBytes = r2Verified
    ? Math.max(0, Number(r2Quota?.r2?.activeLimitBytes ?? r2AllocatedBytes))
    : 0;
  const r2UsedBytes = r2Verified ? Math.max(0, Number(r2Quota?.r2?.usedBytes ?? r2Quota?.usedBytes ?? 0)) : 0;
  const r2RemainingActive = r2Verified ? Math.max(0, r2ActiveBytes - r2UsedBytes) : 0;
  const r2RemainingAllocated = Math.max(0, r2AllocatedBytes - r2UsedBytes);
  const r2UsedPct =
    r2AllocatedBytes > 0 ? Math.min(100, Number(((r2UsedBytes / r2AllocatedBytes) * 100).toFixed(1))) : 0;
  const r2NearLimit = r2Verified && r2ActiveBytes > 0 && r2UsedBytes / r2ActiveBytes >= 0.85;

  const b2AllocatedBytes = limits.b2StorageLimitGb * GIB;
  const effectiveB2 = b2Status ?? r2Quota?.b2 ?? null;
  // Never rely on Firestore b2Enabled alone to report B2 as enabled or verified!
  const b2WorkerConfigured = Boolean(effectiveB2?.workerConfigured ?? (effectiveB2?.verified || effectiveB2?.enabled));
  const b2Verified = Boolean(effectiveB2?.verified === true);
  const b2Enabled = Boolean(effectiveB2?.enabled === true && b2Verified);
  const b2ActiveBytes = b2Enabled ? Math.max(0, Number(effectiveB2?.activeLimitBytes ?? b2AllocatedBytes)) : 0;
  const b2UsedBytes = b2Verified ? Math.max(0, Number(effectiveB2?.usedBytes || 0)) : 0;
  const b2RemainingActive = b2Enabled ? Math.max(0, b2ActiveBytes - b2UsedBytes) : 0;
  const b2RemainingAllocated = Math.max(0, b2AllocatedBytes - b2UsedBytes);
  const b2UsedPct =
    b2AllocatedBytes > 0 ? Math.min(100, Number(((b2UsedBytes / b2AllocatedBytes) * 100).toFixed(1))) : 0;

  const targetTotalBytes = r2AllocatedBytes + b2AllocatedBytes;
  const verifiedActiveTotalBytes = r2ActiveBytes + b2ActiveBytes;
  const totalUsedBytes = r2UsedBytes + (b2Enabled ? b2UsedBytes : 0);
  const remainingActiveBytes = Math.max(0, verifiedActiveTotalBytes - totalUsedBytes);
  const remainingTargetBytes = Math.max(0, targetTotalBytes - totalUsedBytes);
  const usedPercentOfTarget =
    targetTotalBytes > 0 ? Math.min(100, Number(((totalUsedBytes / targetTotalBytes) * 100).toFixed(1))) : 0;
  const usedPercentOfActive =
    verifiedActiveTotalBytes > 0
      ? Math.min(100, Number(((totalUsedBytes / verifiedActiveTotalBytes) * 100).toFixed(1)))
      : 0;

  let b2StatusState: 'verified' | 'unverified' | 'disabled_unlinked' = 'disabled_unlinked';
  let b2StatusMessage = 'غير مفعّل — بانتظار تجهيز حساب Backblaze B2 وربطه فعلياً في Worker';
  if (b2Enabled) {
    b2StatusState = 'verified';
    b2StatusMessage = 'متصل ومُتحقّق فعلياً من حساب Backblaze B2';
  } else if (effectiveB2?.error) {
    b2StatusState = 'unverified';
    b2StatusMessage = `تعذر التحقق الفعلي من Backblaze B2: ${effectiveB2.error}`;
  } else if (b2WorkerConfigured && b2Verified && !b2Enabled) {
    b2StatusState = 'disabled_unlinked';
    b2StatusMessage = 'حساب B2 متصل ومُختبَر — جاهز للتفعيل عند تفعيله من إعدادات النظام';
  } else if (limits.b2Enabled && !b2Verified) {
    b2StatusState = 'unverified';
    b2StatusMessage = 'إعداد Firestore يطلب B2 لكن Worker غير مربوط أو لم ينجح الاختبار الفعلي بعد — المساحة غير محتسبة';
  }

  return {
    r2: {
      provider: 'cloudflare-r2',
      label: 'Cloudflare R2',
      enabled: true,
      verified: r2Verified,
      allocatedBytes: r2AllocatedBytes,
      activeBytes: r2ActiveBytes,
      usedBytes: r2UsedBytes,
      remainingActiveBytes: r2RemainingActive,
      remainingAllocatedBytes: r2RemainingAllocated,
      usedPercentOfAllocated: r2UsedPct,
      fileCount: r2Verified ? Number(r2Quota?.r2?.fileCount ?? r2Quota?.fileCount ?? 0) : 0,
      nearLimit: r2NearLimit,
      status: r2Verified ? 'verified' : 'unverified',
      statusMessage: r2Verified
        ? 'متصل ومُتحقّق فعلياً من حساب Cloudflare R2'
        : r2Quota?.r2?.error
          ? `فشل التحقق من R2: ${r2Quota.r2.error}`
          : 'غير مفعّل كسعة متاحة بعد — بانتظار التحقق الفعلي من حساب Cloudflare R2 وربط Worker',
    },
    b2: {
      provider: 'backblaze-b2',
      label: 'Backblaze B2',
      enabled: b2Enabled,
      verified: b2Verified,
      allocatedBytes: b2AllocatedBytes,
      activeBytes: b2ActiveBytes,
      usedBytes: b2UsedBytes,
      remainingActiveBytes: b2RemainingActive,
      remainingAllocatedBytes: b2RemainingAllocated,
      usedPercentOfAllocated: b2UsedPct,
      fileCount: b2Verified ? Number(effectiveB2?.fileCount || 0) : 0,
      nearLimit: b2Enabled && b2ActiveBytes > 0 && b2UsedBytes / b2ActiveBytes >= 0.85,
      status: b2StatusState,
      statusMessage: b2StatusMessage,
    },
    targetTotalBytes,
    verifiedActiveTotalBytes,
    totalUsedBytes,
    remainingActiveBytes,
    remainingTargetBytes,
    usedPercentOfTarget,
    usedPercentOfActive,
  };
}

export function normalizeR2WorkerBaseUrl(rawUrl?: string | null): string {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/g, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocal) {
      return '';
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/g, '');
  } catch {
    return '';
  }
}

export function formatBytesReadable(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function detectR2FileSpec(
  file: { name: string; type?: string },
  options: { imageOnly?: boolean; videoOnly?: boolean } = {}
): { mediaKind: MediaKind; contentType: string } {
  const cleanName = String(file.name || '').trim().toLowerCase();
  const extMatch = /\.([a-z0-9]+)$/.exec(cleanName);
  const ext = extMatch ? extMatch[1] : '';
  const entry = EXT_INFO[ext];

  if (!entry) {
    throw new R2UploadError(
      'INVALID_TYPE',
      options.imageOnly
        ? 'صيغة الصورة غير مدعومة. المسموح: PNG, JPG, WEBP.'
        : options.videoOnly
          ? 'صيغة الفيديو غير مدعومة. المسموح: MP4, M4V, WEBM.'
          : 'صيغة الملف غير مدعومة. المسموح: MP4/WEBM، PDF، PNG/JPG/WEBP، Office، ZIP.',
      false
    );
  }

  if (options.imageOnly && entry.mediaKind !== 'IMAGE') {
    throw new R2UploadError('INVALID_TYPE', 'يرجى اختيار صورة بصيغة PNG أو JPG أو WEBP.', false);
  }
  if (options.videoOnly && entry.mediaKind !== 'VIDEO') {
    throw new R2UploadError('INVALID_TYPE', 'يرجى اختيار ملف فيديو بصيغة MP4 أو WEBM.', false);
  }

  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  return {
    mediaKind: entry.mediaKind,
    contentType: mime && mime !== 'application/octet-stream' ? mime : entry.contentType,
  };
}

export function validateR2FileLimits(
  fileSize: number,
  mediaKind: MediaKind,
  limits: R2StorageLimits,
  quotaStatus?: R2QuotaStatus | null,
  storageProvider: StorageProviderId = 'r2'
): void {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new R2UploadError('INVALID_TYPE', 'الملف المختار فارغ ولا يمكن رفعه.', false);
  }

  const maxMb =
    mediaKind === 'VIDEO'
      ? limits.maxVideoSizeMb
      : mediaKind === 'IMAGE'
        ? limits.maxImageSizeMb
        : limits.maxPdfSizeMb;
  const maxBytes = maxMb * 1024 * 1024;
  if (fileSize > maxBytes) {
    throw new R2UploadError(
      'FILE_TOO_LARGE',
      `حجم الملف (${formatBytesReadable(fileSize)}) يتجاوز الحد الأقصى المسموح لهذا النوع (${maxMb} MB). يمكنك تعديل الحدود من إعدادات المنصة.`,
      false
    );
  }

  if (quotaStatus) {
    if (storageProvider === 'b2') {
      const b2 = quotaStatus.b2;
      if (!b2 || b2.verified !== true || b2.enabled !== true) {
        throw new R2UploadError(
          'WORKER_NOT_CONFIGURED',
          'خدمة Backblaze B2 غير مفعّلة أو لم تُختبر فعلياً في Worker بعد.',
          false
        );
      }
      const b2Remaining =
        b2.remainingBytes !== undefined
          ? b2.remainingBytes
          : Math.max(0, Number(b2.allocatedLimitBytes || 0) - Number(b2.usedBytes || 0));
      if (fileSize > b2Remaining) {
        throw new R2UploadError(
          'QUOTA_EXCEEDED',
          `المساحة المتبقية في Backblaze B2 (${formatBytesReadable(b2Remaining)}) لا تكفي لرفع هذا الملف (${formatBytesReadable(fileSize)}).`,
          false
        );
      }
      return;
    }

    if (quotaStatus.verified === false || quotaStatus.r2Bound === false) {
      throw new R2UploadError(
        'WORKER_NOT_CONFIGURED',
        'حساب Cloudflare R2 غير متحقق منه بعد. نفّذ «التحقق الفعلي من حساب الخدمة» أولاً.',
        false
      );
    }
    const r2Remaining =
      quotaStatus.r2?.remainingBytes !== undefined
        ? quotaStatus.r2.remainingBytes
        : quotaStatus.remainingBytes;
    if (fileSize > r2Remaining) {
      throw new R2UploadError(
        'QUOTA_EXCEEDED',
        `المساحة المتبقية في Cloudflare R2 (${formatBytesReadable(r2Remaining)}) لا تكفي لرفع هذا الملف (${formatBytesReadable(fileSize)}).`,
        false
      );
    }
  }
}

export function buildFileFingerprint(
  file: { name: string; size: number; lastModified?: number },
  folder: string,
  storageProvider: StorageProviderId = 'r2'
): string {
  return `midad_upload_${storageProvider}::${folder}::${file.name}::${file.size}::${file.lastModified ?? 0}`;
}

export function loadSavedUploadSession(
  storage: SessionStorageLike | undefined,
  fingerprint: string
): ResumableUploadSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(fingerprint);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumableUploadSession;
    if (!parsed?.uploadId || !parsed?.objectKey || !Array.isArray(parsed?.uploadedParts)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveUploadSession(
  storage: SessionStorageLike | undefined,
  session: ResumableUploadSession
): void {
  if (!storage) return;
  try {
    storage.setItem(session.fingerprint, JSON.stringify(session));
  } catch {
    // Ignore storage quota errors in localStorage
  }
}

export function clearSavedUploadSession(
  storage: SessionStorageLike | undefined,
  fingerprint: string
): void {
  if (!storage) return;
  try {
    storage.removeItem(fingerprint);
  } catch {
    // Ignore
  }
}

async function fetchJsonOrThrow(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, init);
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const msg = String(body.error || `خطأ من خادم التخزين (HTTP ${res.status})`);
    const code = String(body.code || '');
    if (res.status === 401 || res.status === 403) throw new R2UploadError('UNAUTHORIZED', msg, false);
    if (res.status === 413 || code === 'FILE_TOO_LARGE') throw new R2UploadError('FILE_TOO_LARGE', msg, false);
    if (res.status === 507 || code === 'QUOTA_EXCEEDED') throw new R2UploadError('QUOTA_EXCEEDED', msg, false);
    if (code === 'B2_NOT_CONFIGURED') throw new R2UploadError('WORKER_NOT_CONFIGURED', msg, false);
    throw new R2UploadError('NETWORK', msg, res.status >= 500);
  }
  return body;
}

export interface MultipartEngineOptions {
  workerBaseUrl: string;
  file: Blob & { name: string; size: number; type?: string; lastModified?: number };
  folder: string;
  getAuthToken: () => Promise<string>;
  storageProvider?: StorageProviderId;
  accessLevel?: MediaAccessLevel;
  limits?: R2StorageLimits;
  quotaStatus?: R2QuotaStatus | null;
  imageOnly?: boolean;
  videoOnly?: boolean;
  maxRetriesPerChunk?: number;
  signal?: AbortSignal;
  pauseController?: { isPaused: () => boolean };
  storage?: SessionStorageLike;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: R2UploadProgress) => void;
}

export async function executeResumableR2Upload(options: MultipartEngineOptions): Promise<R2UploadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const workerBaseUrl = normalizeR2WorkerBaseUrl(options.workerBaseUrl);
  if (!workerBaseUrl) {
    throw new R2UploadError(
      'WORKER_NOT_CONFIGURED',
      'رابط Storage Worker غير مضبوط. انتقل إلى إعدادات المنصة وأدخل رابط Worker الصحيح (HTTPS).',
      false
    );
  }

  const storageProvider: StorageProviderId = options.storageProvider === 'b2' ? 'b2' : 'r2';
  const accessLevel: MediaAccessLevel =
    options.accessLevel ?? (options.folder.trim().toLowerCase() === 'branding' ? 'public' : 'private');
  const limits = options.limits ?? DEFAULT_R2_LIMITS;
  const spec = detectR2FileSpec(options.file, {
    imageOnly: options.imageOnly,
    videoOnly: options.videoOnly,
  });
  validateR2FileLimits(options.file.size, spec.mediaKind, limits, options.quotaStatus, storageProvider);

  const token = await options.getAuthToken();
  if (!token) {
    throw new R2UploadError('UNAUTHENTICATED', 'يرجى تسجيل الدخول بحساب مشرف معتمد قبل الرفع.', false);
  }

  const startMs = Date.now();
  const emitProgress = (
    transferred: number,
    phase: R2UploadProgress['phase'],
    currentPart: number,
    totalParts: number
  ) => {
    const elapsedSec = Math.max(0.1, (Date.now() - startMs) / 1000);
    options.onProgress?.({
      bytesTransferred: transferred,
      totalBytes: options.file.size,
      percent: Math.min(100, Math.round((transferred / Math.max(1, options.file.size)) * 100)),
      speedBytesPerSec: Math.round(transferred / elapsedSec),
      currentPart,
      totalParts,
      phase,
    });
  };

  // Single-shot upload for small files <= 5 MB
  if (options.file.size <= MULTIPART_THRESHOLD_BYTES) {
    emitProgress(0, 'uploading', 1, 1);
    if (options.signal?.aborted) {
      throw new R2UploadError('CANCELED', 'تم إلغاء رفع الملف.', true);
    }
    const result = await fetchJsonOrThrow(
      fetchImpl,
      `${workerBaseUrl}/upload?fileName=${encodeURIComponent(options.file.name)}&folder=${encodeURIComponent(options.folder)}&provider=${storageProvider}&accessLevel=${accessLevel}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': spec.contentType,
          'X-Storage-Provider': storageProvider,
          'X-Access-Level': accessLevel,
        },
        body: options.file,
        signal: options.signal,
      }
    );
    emitProgress(options.file.size, 'completing', 1, 1);
    return {
      url: String(result.publicUrl),
      objectKey: String(result.objectKey),
      storageProvider: result.storageProvider === 'b2' ? 'b2' : storageProvider,
      accessLevel: result.accessLevel === 'public' ? 'public' : accessLevel,
      sizeBytes: Number(result.sizeBytes || options.file.size),
      sizeLabel: formatBytesReadable(Number(result.sizeBytes || options.file.size)),
      contentType: String(result.contentType || spec.contentType),
      mediaKind: (result.mediaKind as MediaKind) || spec.mediaKind,
      fileName: options.file.name,
    };
  }

  // Resumable Multipart Upload (> 5 MB)
  emitProgress(0, 'checking', 0, 1);
  const fingerprint = buildFileFingerprint(options.file, options.folder, storageProvider);
  let session = loadSavedUploadSession(options.storage, fingerprint);

  if (!session) {
    const initJson = await fetchJsonOrThrow(fetchImpl, `${workerBaseUrl}/multipart/init`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: options.file.name,
        contentType: spec.contentType,
        folder: options.folder,
        sizeBytes: options.file.size,
        provider: storageProvider,
        accessLevel,
      }),
      signal: options.signal,
    });

    const partSizeBytes = Number(initJson.partSizeBytes || DEFAULT_PART_SIZE_BYTES);
    const totalParts = Math.ceil(options.file.size / partSizeBytes);
    session = {
      fingerprint,
      fileName: options.file.name,
      sizeBytes: options.file.size,
      folder: options.folder,
      storageProvider,
      uploadId: String(initJson.uploadId),
      objectKey: String(initJson.objectKey),
      partSizeBytes,
      totalParts,
      uploadedParts: [],
      updatedAt: Date.now(),
    };
    saveUploadSession(options.storage, session);
  }

  const uploadedMap = new Map<number, string>();
  for (const p of session.uploadedParts) {
    uploadedMap.set(p.partNumber, p.etag);
  }

  let bytesAlreadyDone = 0;
  for (let pn = 1; pn <= session.totalParts; pn += 1) {
    if (uploadedMap.has(pn)) {
      const start = (pn - 1) * session.partSizeBytes;
      const end = Math.min(options.file.size, start + session.partSizeBytes);
      bytesAlreadyDone += end - start;
    }
  }

  const maxRetries = Math.max(1, options.maxRetriesPerChunk ?? 3);

  for (let partNumber = 1; partNumber <= session.totalParts; partNumber += 1) {
    if (uploadedMap.has(partNumber)) continue;

    if (options.signal?.aborted) {
      throw new R2UploadError('CANCELED', 'تم إلغاء عملية الرفع وحذف الجلسة.', true);
    }
    if (options.pauseController?.isPaused()) {
      emitProgress(bytesAlreadyDone, 'paused', partNumber, session.totalParts);
      throw new R2UploadError('PAUSED', 'تم إيقاف الرفع مؤقتاً ويمكنك استئنافه من حيث توقف.', true);
    }

    const start = (partNumber - 1) * session.partSizeBytes;
    const end = Math.min(options.file.size, start + session.partSizeBytes);
    const chunkBlob = options.file.slice(start, end, spec.contentType);

    emitProgress(bytesAlreadyDone, 'uploading', partNumber, session.totalParts);

    let lastErr: unknown = null;
    let uploadedPart: UploadedPartRecord | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      if (options.signal?.aborted) {
        throw new R2UploadError('CANCELED', 'تم إلغاء عملية الرفع.', true);
      }
      if (options.pauseController?.isPaused()) {
        emitProgress(bytesAlreadyDone, 'paused', partNumber, session.totalParts);
        throw new R2UploadError('PAUSED', 'تم إيقاف الرفع مؤقتاً.', true);
      }

      try {
        const freshToken = await options.getAuthToken();
        const partRes = await fetchJsonOrThrow(
          fetchImpl,
          `${workerBaseUrl}/multipart/part?key=${encodeURIComponent(session.objectKey)}&uploadId=${encodeURIComponent(session.uploadId)}&partNumber=${partNumber}&provider=${storageProvider}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${freshToken}`,
              'Content-Type': 'application/octet-stream',
              'X-Storage-Provider': storageProvider,
            },
            body: chunkBlob,
            signal: options.signal,
          }
        );
        uploadedPart = {
          partNumber: Number(partRes.partNumber || partNumber),
          etag: String(partRes.etag),
        };
        break;
      } catch (err) {
        lastErr = err;
        if (err instanceof R2UploadError && !err.retryable) throw err;
        if (options.signal?.aborted) {
          throw new R2UploadError('CANCELED', 'تم إلغاء عملية الرفع.', true);
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }

    if (!uploadedPart) {
      throw lastErr instanceof Error
        ? lastErr
        : new R2UploadError('NETWORK', 'فشل رفع أحد أجزاء الملف بعد عدة محاولات. يمكنك الاستئناف لاحقاً.', true);
    }

    uploadedMap.set(uploadedPart.partNumber, uploadedPart.etag);
    session.uploadedParts = Array.from(uploadedMap.entries())
      .map(([pn, etag]) => ({ partNumber: pn, etag }))
      .sort((a, b) => a.partNumber - b.partNumber);
    session.updatedAt = Date.now();
    saveUploadSession(options.storage, session);

    bytesAlreadyDone += end - start;
    emitProgress(bytesAlreadyDone, 'uploading', partNumber, session.totalParts);
  }

  emitProgress(options.file.size, 'completing', session.totalParts, session.totalParts);
  const finalToken = await options.getAuthToken();
  const completedJson = await fetchJsonOrThrow(fetchImpl, `${workerBaseUrl}/multipart/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${finalToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      objectKey: session.objectKey,
      uploadId: session.uploadId,
      provider: storageProvider,
      parts: session.uploadedParts,
    }),
    signal: options.signal,
  });

  clearSavedUploadSession(options.storage, fingerprint);

  const finalSize = Number(completedJson.sizeBytes || options.file.size);
  return {
    url: String(completedJson.publicUrl),
    objectKey: String(completedJson.objectKey || session.objectKey),
    storageProvider: completedJson.storageProvider === 'b2' ? 'b2' : storageProvider,
    accessLevel: completedJson.accessLevel === 'public' ? 'public' : accessLevel,
    sizeBytes: finalSize,
    sizeLabel: formatBytesReadable(finalSize),
    contentType: String(completedJson.contentType || spec.contentType),
    mediaKind: (completedJson.mediaKind as MediaKind) || spec.mediaKind,
    fileName: options.file.name,
  };
}
