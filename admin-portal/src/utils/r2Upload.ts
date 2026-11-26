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
  | 'WORKER_INVALID_URL'
  | 'WORKER_UNREACHABLE'
  | 'UNAUTHENTICATED'
  | 'INVALID_TYPE'
  | 'FILE_TOO_LARGE'
  | 'QUOTA_EXCEEDED'
  | 'STORAGE_UNAVAILABLE'
  | 'UPLOAD_SESSION_EXPIRED'
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

export interface WorkerUrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  reason: 'OK' | 'EMPTY' | 'INSECURE_PROTOCOL' | 'INVALID_FORMAT';
  errorMessage: string | null;
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
  workerBaseUrl?: string;
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
  ppt: {
    mediaKind: 'ATTACHMENT',
    contentType: 'application/vnd.ms-powerpoint',
  },
  pptx: {
    mediaKind: 'ATTACHMENT',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
};

const MIME_ALIASES: Record<string, string> = {
  'application/x-pdf': 'application/pdf',
  'image/pjpeg': 'image/jpeg',
};

const INVISIBLE_URL_CHARS_RE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\r\n\t]/g;

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
          : b2Enabled && r2Quota?.r2Bound === false
            ? 'غير مربوط في Worker حالياً (التخزين الأساسي يعمل عبر Backblaze B2)'
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

function stripWorkerRouteSuffix(pathname: string): string {
  const cleaned = pathname.replace(/\/+$/g, '');
  if (!cleaned) return '';
  const exactRouteSuffixes = [
    '/health',
    '/quota',
    '/providers/status',
    '/upload',
    '/multipart/init',
    '/multipart/part',
    '/multipart/complete',
    '/multipart/abort',
    '/signed-url',
    '/b2/signed-url',
    '/object',
  ];
  for (const suffix of exactRouteSuffixes) {
    if (cleaned.toLowerCase().endsWith(suffix)) {
      return cleaned.slice(0, cleaned.length - suffix.length);
    }
  }
  const filesIdx = cleaned.search(/\/(?:files|b2\/files)(?:\/|$)/i);
  if (filesIdx >= 0) {
    return cleaned.slice(0, filesIdx);
  }
  return cleaned;
}

export function validateR2WorkerBaseUrlInput(rawUrl?: string | null): WorkerUrlValidationResult {
  const cleaned = String(rawUrl || '')
    .replace(INVISIBLE_URL_CHARS_RE, '')
    .trim()
    .replace(/\/+$/g, '');
  if (!cleaned) {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'EMPTY',
      errorMessage:
        'رابط Storage Worker غير مضبوط. انتقل إلى إعدادات المنصة وأدخل رابط Worker الصحيح (HTTPS).',
    };
  }
  try {
    const parsed = new URL(cleaned);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocal) {
      return {
        valid: false,
        normalizedUrl: '',
        reason: 'INSECURE_PROTOCOL',
        errorMessage:
          'رابط Storage Worker غير صالح للأمان: يجب أن يبدأ بـ https:// (مثال: https://midad-r2-worker.your-subdomain.workers.dev).',
      };
    }
    const basePath = stripWorkerRouteSuffix(parsed.pathname);
    return {
      valid: true,
      normalizedUrl: `${parsed.origin}${basePath}`,
      reason: 'OK',
      errorMessage: null,
    };
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      reason: 'INVALID_FORMAT',
      errorMessage:
        'صيغة رابط Storage Worker غير صالحة. تأكد من كتابة الرابط كاملاً مثل https://midad-r2-worker.your-subdomain.workers.dev دون مسافات.',
    };
  }
}

export function normalizeR2WorkerBaseUrl(rawUrl?: string | null): string {
  return validateR2WorkerBaseUrlInput(rawUrl).normalizedUrl;
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
          : 'صيغة الملف غير مدعومة. المسموح: MP4/WEBM، PDF، PNG/JPG/WEBP، Office (DOC/DOCX/PPT/PPTX)، ZIP.',
      false
    );
  }

  if (options.imageOnly && entry.mediaKind !== 'IMAGE') {
    throw new R2UploadError('INVALID_TYPE', 'يرجى اختيار صورة بصيغة PNG أو JPG أو WEBP.', false);
  }
  if (options.videoOnly && entry.mediaKind !== 'VIDEO') {
    throw new R2UploadError('INVALID_TYPE', 'يرجى اختيار ملف فيديو بصيغة MP4 أو WEBM.', false);
  }

  const rawMime = String(file.type || '').split(';')[0].trim().toLowerCase();
  const mime = MIME_ALIASES[rawMime] || rawMime;
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

    const r2ExplicitlyFailed = quotaStatus.r2 ? !quotaStatus.r2.verified : quotaStatus.verified === false;
    if (r2ExplicitlyFailed || quotaStatus.r2Bound === false) {
      throw new R2UploadError(
        'WORKER_NOT_CONFIGURED',
        'حساب Cloudflare R2 غير مربوط أو غير متحقق منه. اختر Backblaze B2 أو اربط MEDIA_BUCKET أولاً.',
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

export interface WorkerHealthCheckResult {
  ok: boolean;
  service: string;
  primaryProvider?: StorageProviderId;
  r2Bound: boolean;
  b2Bound: boolean;
  b2Enabled: boolean;
  b2WorkerConfigured: boolean;
  limits?: R2StorageLimits;
}

export async function fetchJsonOrThrow(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  let res: Response;
  let timedOut = false;
  const timeoutController = new AbortController();
  const externalSignal = init.signal;
  const onExternalAbort = () => timeoutController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      throw new R2UploadError('CANCELED', 'تم إلغاء العملية.', true);
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          timeoutController.abort();
        }, timeoutMs)
      : null;

  try {
    res = await fetchImpl(url, { ...init, signal: timeoutController.signal });
  } catch (err) {
    if (externalSignal?.aborted) {
      throw new R2UploadError('CANCELED', 'تم إلغاء عملية الرفع.', true);
    }
    if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      throw new R2UploadError(
        'NETWORK',
        'انتهت مهلة الاتصال بخادم Storage Worker. تحقق من سرعة الإنترنت وأعد المحاولة.',
        true
      );
    }
    throw new R2UploadError(
      'WORKER_UNREACHABLE',
      'تعذر الاتصال بخادم Storage Worker (مشكلة شبكة أو رابط خاطئ أو CORS). تأكد من نشر Worker وإضافة رابط لوحة الإدارة في ALLOWED_ORIGINS.',
      true
    );
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!res.ok) {
    const code = String(body.code || '').trim();
    const rawMsg = typeof body.error === 'string' && body.error.trim() ? body.error.trim() : '';

    if (res.status === 401) {
      throw new R2UploadError(
        'UNAUTHENTICATED',
        rawMsg || 'انتهت جلسة تسجيل الدخول أو رمز التحقق غير صالح (401). حدّث الصفحة أو أعد تسجيل الدخول.',
        false
      );
    }
    if (res.status === 403) {
      throw new R2UploadError(
        'UNAUTHORIZED',
        rawMsg || 'ليس لديك صلاحية تنفيذ هذا الإجراء على خادم التخزين (403). تأكد من دورك في admins/{uid}.',
        false
      );
    }
    if (res.status === 404 && code === 'UPLOAD_SESSION_NOT_FOUND') {
      throw new R2UploadError(
        'UPLOAD_SESSION_EXPIRED',
        rawMsg || 'انتهت جلسة الرفع المجزأ على الخادم. جارٍ بدء جلسة جديدة.',
        true
      );
    }
    if (res.status === 413 || code === 'FILE_TOO_LARGE') {
      throw new R2UploadError('FILE_TOO_LARGE', rawMsg || 'حجم الملف يتجاوز الحد الأقصى المسموح.', false);
    }
    if (res.status === 415) {
      throw new R2UploadError('INVALID_TYPE', rawMsg || 'صيغة أو امتداد الملف غير مدعوم.', false);
    }
    if (res.status === 507 || code === 'QUOTA_EXCEEDED') {
      throw new R2UploadError('QUOTA_EXCEEDED', rawMsg || 'المساحة التخزينية ممتلئة ولا تكفي لرفع الملف.', false);
    }
    if (code === 'B2_NOT_CONFIGURED') {
      throw new R2UploadError(
        'WORKER_NOT_CONFIGURED',
        rawMsg || 'خدمة Backblaze B2 غير مفعّلة أو لم تُربط مفاتيحها في Worker بعد.',
        false
      );
    }
    if (code === 'MEDIA_BUCKET_MISSING' || code === 'R2_UNAVAILABLE' || code === 'B2_UNAVAILABLE') {
      throw new R2UploadError(
        'STORAGE_UNAVAILABLE',
        rawMsg || 'خادم Worker يعمل لكن مساحة التخزين (R2 أو B2) غير مربوطة أو غير متاحة حالياً.',
        res.status === 503
      );
    }
    throw new R2UploadError(
      'NETWORK',
      rawMsg || `خطأ من خادم التخزين (HTTP ${res.status})`,
      res.status >= 500
    );
  }
  return body;
}

export async function verifyWorkerHealth({
  workerBaseUrl,
  storageProvider,
  fetchImpl = fetch,
  signal,
  timeoutMs = 15_000,
}: {
  workerBaseUrl: string;
  storageProvider?: StorageProviderId;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<WorkerHealthCheckResult> {
  const urlCheck = validateR2WorkerBaseUrlInput(workerBaseUrl);
  if (!urlCheck.valid) {
    throw new R2UploadError(
      urlCheck.reason === 'EMPTY' ? 'WORKER_NOT_CONFIGURED' : 'WORKER_INVALID_URL',
      urlCheck.errorMessage!,
      false
    );
  }

  let data: Record<string, unknown>;
  try {
    data = await fetchJsonOrThrow(
      fetchImpl,
      `${urlCheck.normalizedUrl}/health`,
      { method: 'GET', signal },
      timeoutMs
    );
  } catch (err) {
    if (err instanceof R2UploadError) {
      if (err.code === 'CANCELED') throw err;
      throw new R2UploadError(
        'WORKER_UNREACHABLE',
        `فشل فحص اتصال Storage Worker (${urlCheck.normalizedUrl}/health): ${err.message}`,
        err.retryable
      );
    }
    throw err;
  }

  if (data.ok !== true || String(data.service || '') !== 'midad-r2-worker') {
    throw new R2UploadError(
      'WORKER_UNREACHABLE',
      'الرابط لا يشير إلى خدمة midad-r2-worker الصالحة (/health لم يُرجع استجابة الخدمة المتوقعة).',
      false
    );
  }

  const r2Bound = Boolean(data.r2Bound);
  const b2Enabled = Boolean(data.b2Enabled);
  const b2WorkerConfigured = Boolean(data.b2WorkerConfigured);
  const b2Bound = Boolean(data.b2Bound ?? b2WorkerConfigured);
  const primaryProvider: StorageProviderId | undefined =
    data.primaryProvider === 'b2' ? 'b2' : data.primaryProvider === 'r2' ? 'r2' : undefined;

  if (storageProvider === 'r2' && !r2Bound) {
    throw new R2UploadError(
      'STORAGE_UNAVAILABLE',
      'تم الوصول إلى Storage Worker بنجاح، لكن R2 Bucket (MEDIA_BUCKET) غير مربوط في إعدادات Worker على Cloudflare.',
      false
    );
  }
  if (storageProvider === 'b2' && !b2Enabled) {
    throw new R2UploadError(
      'WORKER_NOT_CONFIGURED',
      'تم الوصول إلى Worker لكن مزود Backblaze B2 غير مفعّل بعد (تأكد من ضبط الأسرار B2_KEY_ID و B2_APPLICATION_KEY و B2_BUCKET_NAME و B2_ENDPOINT في Cloudflare Worker).',
      false
    );
  }
  if (!storageProvider && !r2Bound && !b2Enabled) {
    throw new R2UploadError(
      'STORAGE_UNAVAILABLE',
      'تم الوصول إلى Storage Worker بنجاح، لكن لا يوجد مزود تخزين مربوط بعد (أضف أسرار Backblaze B2 أو اربط MEDIA_BUCKET لـ R2).',
      false
    );
  }

  return {
    ok: true,
    service: String(data.service || 'midad-r2-worker'),
    primaryProvider,
    r2Bound,
    b2Bound,
    b2Enabled,
    b2WorkerConfigured,
    limits: data.limits as R2StorageLimits | undefined,
  };
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
  skipHealthCheck?: boolean;
  signal?: AbortSignal;
  pauseController?: { isPaused: () => boolean };
  storage?: SessionStorageLike;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: R2UploadProgress) => void;
}

export async function executeResumableR2Upload(options: MultipartEngineOptions): Promise<R2UploadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const urlValidation = validateR2WorkerBaseUrlInput(options.workerBaseUrl);
  if (!urlValidation.valid) {
    throw new R2UploadError(
      urlValidation.reason === 'EMPTY' ? 'WORKER_NOT_CONFIGURED' : 'WORKER_INVALID_URL',
      urlValidation.errorMessage!,
      false
    );
  }
  const workerBaseUrl = urlValidation.normalizedUrl;

  const explicitProvider = options.storageProvider;
  const accessLevel: MediaAccessLevel =
    options.accessLevel ?? (options.folder.trim().toLowerCase() === 'branding' ? 'public' : 'private');
  const limits = options.limits ?? DEFAULT_R2_LIMITS;
  const spec = detectR2FileSpec(options.file, {
    imageOnly: options.imageOnly,
    videoOnly: options.videoOnly,
  });

  const inferInitialProvider = (): StorageProviderId => {
    if (explicitProvider) return explicitProvider;
    if (options.quotaStatus?.primaryProvider) return options.quotaStatus.primaryProvider;
    if (options.quotaStatus?.b2?.enabled && options.quotaStatus?.b2?.verified) return 'b2';
    return 'r2';
  };

  let storageProvider: StorageProviderId = inferInitialProvider();
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

  emitProgress(0, 'checking', 0, 1);

  if (!options.skipHealthCheck) {
    const health = await verifyWorkerHealth({
      workerBaseUrl,
      storageProvider: explicitProvider,
      fetchImpl,
      signal: options.signal,
    });
    if (!explicitProvider) {
      storageProvider =
        health.primaryProvider === 'b2' || (health.b2Enabled && !health.r2Bound)
          ? 'b2'
          : health.r2Bound
            ? 'r2'
            : health.b2Enabled
              ? 'b2'
              : 'r2';
      validateR2FileLimits(options.file.size, spec.mediaKind, limits, options.quotaStatus, storageProvider);
    }
  }

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
      },
      120_000
    );
    const resolvedPublicUrl = typeof result.publicUrl === 'string' ? result.publicUrl.trim() : '';
    const resolvedObjectKey = typeof result.objectKey === 'string' ? result.objectKey.trim() : '';
    if (!resolvedPublicUrl || !resolvedObjectKey) {
      throw new R2UploadError(
        'UNKNOWN',
        'استجاب خادم التخزين لكن لم يُرجع رابط الملف أو مفتاح التخزين بشكل مكتمل.',
        true
      );
    }
    emitProgress(options.file.size, 'completing', 1, 1);
    return {
      url: resolvedPublicUrl,
      objectKey: resolvedObjectKey,
      storageProvider: result.storageProvider === 'b2' ? 'b2' : storageProvider,
      accessLevel: result.accessLevel === 'public' ? 'public' : accessLevel,
      sizeBytes: Number(result.sizeBytes || options.file.size),
      sizeLabel: formatBytesReadable(Number(result.sizeBytes || options.file.size)),
      contentType: String(result.contentType || spec.contentType),
      mediaKind: (result.mediaKind as MediaKind) || spec.mediaKind,
      fileName: options.file.name,
    };
  }

  // Resumable Multipart Upload (> 5 MB, cleanly handles > 50 MB without duplicates)
  const fingerprint = buildFileFingerprint(options.file, options.folder, storageProvider);
  let allowRestartExpiredSession = true;

  while (true) {
    let session = loadSavedUploadSession(options.storage, fingerprint);
    if (session && session.workerBaseUrl && session.workerBaseUrl !== workerBaseUrl) {
      clearSavedUploadSession(options.storage, fingerprint);
      session = null;
    }

    if (!session) {
      const initToken = await options.getAuthToken();
      const initJson = await fetchJsonOrThrow(
        fetchImpl,
        `${workerBaseUrl}/multipart/init`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${initToken}`,
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
        },
        60_000
      );

      const partSizeBytes = Number(initJson.partSizeBytes || DEFAULT_PART_SIZE_BYTES);
      const totalParts = Math.ceil(options.file.size / partSizeBytes);
      session = {
        fingerprint,
        fileName: options.file.name,
        sizeBytes: options.file.size,
        folder: options.folder,
        workerBaseUrl,
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

    try {
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
              },
              120_000
            );
            uploadedPart = {
              partNumber: Number(partRes.partNumber || partNumber),
              etag: String(partRes.etag),
            };
            break;
          } catch (err) {
            lastErr = err;
            if (err instanceof R2UploadError && err.code === 'UPLOAD_SESSION_EXPIRED') {
              throw err;
            }
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
      const completedJson = await fetchJsonOrThrow(
        fetchImpl,
        `${workerBaseUrl}/multipart/complete`,
        {
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
        },
        120_000
      );

      const completedUrl =
        typeof completedJson.publicUrl === 'string' ? completedJson.publicUrl.trim() : '';
      const completedKey =
        typeof completedJson.objectKey === 'string' && completedJson.objectKey.trim()
          ? completedJson.objectKey.trim()
          : session.objectKey;
      if (!completedUrl || !completedKey) {
        throw new R2UploadError(
          'UNKNOWN',
          'اكتمل رفع الأجزاء لكن الخادم لم يؤكد رابط الملف النهائي.',
          true
        );
      }

      clearSavedUploadSession(options.storage, fingerprint);

      const finalSize = Number(completedJson.sizeBytes || options.file.size);
      return {
        url: completedUrl,
        objectKey: completedKey,
        storageProvider: completedJson.storageProvider === 'b2' ? 'b2' : storageProvider,
        accessLevel: completedJson.accessLevel === 'public' ? 'public' : accessLevel,
        sizeBytes: finalSize,
        sizeLabel: formatBytesReadable(finalSize),
        contentType: String(completedJson.contentType || spec.contentType),
        mediaKind: (completedJson.mediaKind as MediaKind) || spec.mediaKind,
        fileName: options.file.name,
      };
    } catch (err) {
      if (err instanceof R2UploadError && err.code === 'UPLOAD_SESSION_EXPIRED' && allowRestartExpiredSession) {
        allowRestartExpiredSession = false;
        clearSavedUploadSession(options.storage, fingerprint);
        continue;
      }
      throw err;
    }
  }
}
