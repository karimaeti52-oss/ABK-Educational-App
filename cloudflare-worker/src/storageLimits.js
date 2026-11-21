export const DEFAULT_LIMITS = {
  maxVideoSizeMb: 200,
  maxPdfSizeMb: 100,
  maxImageSizeMb: 20,
  totalStorageLimitGb: 25,
};

export const PART_SIZE_BYTES = 5 * 1024 * 1024; // R2 minimum part size (5 MiB, except final part)
export const MAX_SINGLE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const QUOTA_WARNING_RATIO = 0.85;

const ALLOWED_EXTENSION_MAP = {
  mp4: { mediaKind: 'VIDEO', mimeTypes: ['video/mp4'] },
  m4v: { mediaKind: 'VIDEO', mimeTypes: ['video/mp4', 'video/x-m4v'] },
  webm: { mediaKind: 'VIDEO', mimeTypes: ['video/webm'] },
  pdf: { mediaKind: 'PDF', mimeTypes: ['application/pdf'] },
  png: { mediaKind: 'IMAGE', mimeTypes: ['image/png'] },
  jpg: { mediaKind: 'IMAGE', mimeTypes: ['image/jpeg', 'image/jpg'] },
  jpeg: { mediaKind: 'IMAGE', mimeTypes: ['image/jpeg', 'image/jpg'] },
  webp: { mediaKind: 'IMAGE', mimeTypes: ['image/webp'] },
  zip: { mediaKind: 'ATTACHMENT', mimeTypes: ['application/zip', 'application/x-zip-compressed'] },
  txt: { mediaKind: 'ATTACHMENT', mimeTypes: ['text/plain'] },
  doc: { mediaKind: 'ATTACHMENT', mimeTypes: ['application/msword'] },
  docx: {
    mediaKind: 'ATTACHMENT',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  pptx: {
    mediaKind: 'ATTACHMENT',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
};

export function normalizeEnvLimits(env, dynamicConfig = null) {
  const toPositiveInt = (val, fallback, min, max) => {
    const parsed = Number(val);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.round(parsed);
    return Math.min(max, Math.max(min, rounded));
  };

  return {
    maxVideoSizeMb: toPositiveInt(
      dynamicConfig?.maxVideoSizeMb ?? env?.DEFAULT_MAX_VIDEO_MB,
      DEFAULT_LIMITS.maxVideoSizeMb,
      1,
      2048
    ),
    maxPdfSizeMb: toPositiveInt(
      dynamicConfig?.maxPdfSizeMb ?? env?.DEFAULT_MAX_PDF_MB,
      DEFAULT_LIMITS.maxPdfSizeMb,
      1,
      1024
    ),
    maxImageSizeMb: toPositiveInt(
      dynamicConfig?.maxImageSizeMb ?? env?.DEFAULT_MAX_IMAGE_MB,
      DEFAULT_LIMITS.maxImageSizeMb,
      1,
      256
    ),
    totalStorageLimitGb: toPositiveInt(
      dynamicConfig?.totalStorageLimitGb ?? env?.DEFAULT_TOTAL_LIMIT_GB,
      DEFAULT_LIMITS.totalStorageLimitGb,
      1,
      1000
    ),
  };
}

export function inferMediaDescriptor(fileName, declaredContentType = '') {
  const cleanName = String(fileName || '').trim();
  const extMatch = cleanName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const entry = ALLOWED_EXTENSION_MAP[ext];
  if (!entry) {
    return null;
  }

  const normalizedMime = String(declaredContentType || '').split(';')[0].trim().toLowerCase();
  if (
    normalizedMime &&
    normalizedMime !== 'application/octet-stream' &&
    !entry.mimeTypes.includes(normalizedMime)
  ) {
    return null;
  }

  return {
    ext,
    mediaKind: entry.mediaKind,
    contentType: normalizedMime && entry.mimeTypes.includes(normalizedMime) ? normalizedMime : entry.mimeTypes[0],
  };
}

export function getMaxBytesForKind(mediaKind, limits) {
  switch (mediaKind) {
    case 'VIDEO':
      return limits.maxVideoSizeMb * 1024 * 1024;
    case 'PDF':
    case 'ATTACHMENT':
      return limits.maxPdfSizeMb * 1024 * 1024;
    case 'IMAGE':
      return limits.maxImageSizeMb * 1024 * 1024;
    default:
      return limits.maxPdfSizeMb * 1024 * 1024;
  }
}

export function sanitizeFolder(folder) {
  const clean = String(folder || 'general')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '_');
  if (!clean || clean.includes('..')) return 'general';
  return clean.slice(0, 80);
}

export function buildSafeObjectKey(folder, fileName, uniquePrefix = null) {
  const cleanFolder = sanitizeFolder(folder);
  const safeFile = String(fileName || 'file.bin')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 120);
  const token = uniquePrefix || `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  return `${cleanFolder}/${token}_${safeFile || 'asset'}`;
}

export function isValidObjectKey(objectKey) {
  if (typeof objectKey !== 'string') return false;
  const trimmed = objectKey.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (trimmed.startsWith('/') || trimmed.includes('..') || trimmed.includes('\\') || trimmed.includes('\0')) {
    return false;
  }
  return /^[a-zA-Z0-9/_.-]+$/.test(trimmed);
}

export function parseHttpRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string') {
    return { type: 'full' };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return { type: 'invalid' };
  }
  if (totalSize <= 0) {
    return { type: 'unsatisfiable' };
  }

  const rawStart = match[1];
  const rawEnd = match[2];
  if (rawStart === '' && rawEnd === '') {
    return { type: 'invalid' };
  }

  let start;
  let end;
  if (rawStart === '') {
    // Suffix byte range: bytes=-500
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { type: 'unsatisfiable' };
    }
    start = Math.max(0, totalSize - suffixLength);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= totalSize ||
    end < start
  ) {
    return { type: 'unsatisfiable' };
  }

  return {
    type: 'partial',
    offset: start,
    length: end - start + 1,
    end,
    totalSize,
  };
}

export function guessContentTypeFromKey(objectKey, storedContentType = '') {
  if (storedContentType && storedContentType !== 'application/octet-stream') {
    return storedContentType;
  }
  const descriptor = inferMediaDescriptor(objectKey);
  return descriptor ? descriptor.contentType : 'application/octet-stream';
}
