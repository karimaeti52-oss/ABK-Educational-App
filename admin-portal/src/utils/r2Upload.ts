import type { MediaKind, PlatformConfig, R2QuotaStatus, R2StorageLimits } from '../types.ts';

export const DEFAULT_R2_LIMITS: R2StorageLimits = {
  maxVideoSizeMb: 200,
  maxPdfSizeMb: 100,
  maxImageSizeMb: 20,
  totalStorageLimitGb: 25,
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
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    maxVideoSizeMb: clamp(config?.maxVideoSizeMb, DEFAULT_R2_LIMITS.maxVideoSizeMb, 1, 2048),
    maxPdfSizeMb: clamp(config?.maxPdfSizeMb, DEFAULT_R2_LIMITS.maxPdfSizeMb, 1, 1024),
    maxImageSizeMb: clamp(config?.maxImageSizeMb, DEFAULT_R2_LIMITS.maxImageSizeMb, 1, 256),
    totalStorageLimitGb: clamp(config?.totalStorageLimitGb, DEFAULT_R2_LIMITS.totalStorageLimitGb, 1, 1000),
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
  quotaStatus?: R2QuotaStatus | null
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

  if (quotaStatus && fileSize > quotaStatus.remainingBytes) {
    throw new R2UploadError(
      'QUOTA_EXCEEDED',
      `المساحة المتبقية (${formatBytesReadable(quotaStatus.remainingBytes)}) لا تكفي لرفع هذا الملف (${formatBytesReadable(fileSize)}).`,
      false
    );
  }
}

export function buildFileFingerprint(
  file: { name: string; size: number; lastModified?: number },
  folder: string
): string {
  return `midad_r2_upload::${folder}::${file.name}::${file.size}::${file.lastModified ?? 0}`;
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
    if (res.status === 401) throw new R2UploadError('UNAUTHORIZED', msg, false);
    if (res.status === 403) throw new R2UploadError('UNAUTHORIZED', msg, false);
    if (res.status === 413 || code === 'FILE_TOO_LARGE') throw new R2UploadError('FILE_TOO_LARGE', msg, false);
    if (res.status === 507 || code === 'QUOTA_EXCEEDED') throw new R2UploadError('QUOTA_EXCEEDED', msg, false);
    throw new R2UploadError('NETWORK', msg, res.status >= 500);
  }
  return body;
}

export interface MultipartEngineOptions {
  workerBaseUrl: string;
  file: Blob & { name: string; size: number; type?: string; lastModified?: number };
  folder: string;
  getAuthToken: () => Promise<string>;
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
      'رابط Cloudflare R2 Worker غير مضبوط. انتقل إلى إعدادات المنصة وأدخل رابط Worker الصحيح (HTTPS).',
      false
    );
  }

  const limits = options.limits ?? DEFAULT_R2_LIMITS;
  const spec = detectR2FileSpec(options.file, {
    imageOnly: options.imageOnly,
    videoOnly: options.videoOnly,
  });
  validateR2FileLimits(options.file.size, spec.mediaKind, limits, options.quotaStatus);

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
      `${workerBaseUrl}/upload?fileName=${encodeURIComponent(options.file.name)}&folder=${encodeURIComponent(options.folder)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': spec.contentType,
        },
        body: options.file,
        signal: options.signal,
      }
    );
    emitProgress(options.file.size, 'completing', 1, 1);
    return {
      url: String(result.publicUrl),
      objectKey: String(result.objectKey),
      sizeBytes: Number(result.sizeBytes || options.file.size),
      sizeLabel: formatBytesReadable(Number(result.sizeBytes || options.file.size)),
      contentType: String(result.contentType || spec.contentType),
      mediaKind: (result.mediaKind as MediaKind) || spec.mediaKind,
      fileName: options.file.name,
    };
  }

  // Resumable Multipart Upload (> 5 MB)
  emitProgress(0, 'checking', 0, 1);
  const fingerprint = buildFileFingerprint(options.file, options.folder);
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
          `${workerBaseUrl}/multipart/part?key=${encodeURIComponent(session.objectKey)}&uploadId=${encodeURIComponent(session.uploadId)}&partNumber=${partNumber}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${freshToken}`,
              'Content-Type': 'application/octet-stream',
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
      parts: session.uploadedParts,
    }),
    signal: options.signal,
  });

  clearSavedUploadSession(options.storage, fingerprint);

  const finalSize = Number(completedJson.sizeBytes || options.file.size);
  return {
    url: String(completedJson.publicUrl),
    objectKey: String(completedJson.objectKey || session.objectKey),
    sizeBytes: finalSize,
    sizeLabel: formatBytesReadable(finalSize),
    contentType: String(completedJson.contentType || spec.contentType),
    mediaKind: (completedJson.mediaKind as MediaKind) || spec.mediaKind,
    fileName: options.file.name,
  };
}
