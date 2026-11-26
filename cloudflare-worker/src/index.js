import {
  fetchFirestoreDocWithToken,
  resolveStaffAuthorization,
  verifyReaderNotBanned,
} from './auth.js';
import { createB2S3Client, hasB2Credentials } from './b2S3Client.js';
import {
  buildSafeObjectKey,
  getMaxBytesForKind,
  guessContentTypeFromKey,
  inferMediaDescriptor,
  isValidObjectKey,
  MAX_SINGLE_UPLOAD_BYTES,
  normalizeEnvLimits,
  parseHttpRangeHeader,
  PART_SIZE_BYTES,
  QUOTA_WARNING_RATIO,
} from './storageLimits.js';

const GIB = 1024 * 1024 * 1024;

let cachedLimits = null;
let cachedLimitsExpiresAt = 0;

function encodeObjectKeySegments(objectKey) {
  return objectKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function decodeObjectKeyFromPath(pathname, prefix) {
  const raw = pathname.slice(prefix.length).replace(/^\/+/, '');
  if (!raw) return '';
  return raw
    .split('/')
    .map((seg) => decodeURIComponent(seg))
    .join('/');
}

function parseAllowedOrigins(env) {
  return String(env?.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCorsHeaders(request, env, allowPublicMedia = false) {
  const origin = request.headers.get('Origin');
  const allowed = parseAllowedOrigins(env);
  const headers = new Headers({
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Range, X-File-Name, X-Folder, X-File-Size, X-Storage-Provider, X-Access-Level',
    'Access-Control-Expose-Headers':
      'Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Cache-Control',
    'Access-Control-Max-Age': '86400',
  });

  if (origin) {
    if (allowed.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
    } else if (allowPublicMedia && allowed.length === 0) {
      headers.set('Access-Control-Allow-Origin', origin);
    }
  }
  return headers;
}

function jsonResponse(data, status, request, env) {
  const headers = buildCorsHeaders(request, env, false);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}

function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function resolveProviderParam(rawValue, defaultProvider = 'b2') {
  const cleaned = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim().toLowerCase();
  if (!cleaned) return defaultProvider;
  if (cleaned === 'r2' || cleaned === 'b2') {
    return cleaned;
  }
  return null;
}

function getDefaultProvider(env, limits = null) {
  if (limits?.b2Enabled) return 'b2';
  const b2FlagNotFalse = String(env?.B2_ENABLED ?? '').trim().toLowerCase() !== 'false';
  if (hasB2Credentials(env) && b2FlagNotFalse) return 'b2';
  if (env?.MEDIA_BUCKET) return 'r2';
  return 'b2';
}

function extractB2KeyFromUrlOrParam(rawKey, rawUrl) {
  const cleanKey = String(rawKey || '').trim();
  if (cleanKey) return cleanKey;
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanUrl) return '';
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.pathname.startsWith('/b2/files/')) {
      return decodeObjectKeyFromPath(parsed.pathname, '/b2/files/');
    }
    return '';
  } catch {
    return '';
  }
}

function resolveAccessLevelParam(rawValue, folder = '') {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (normalized === 'public') return 'public';
  if (normalized === 'private') return 'private';
  return String(folder || '').trim().toLowerCase() === 'branding' ? 'public' : 'private';
}

function buildPublicMediaUrl(origin, provider, objectKey) {
  const prefix = provider === 'b2' ? '/b2/files/' : '/files/';
  return `${origin}${prefix}${encodeObjectKeySegments(objectKey)}`;
}

function isMissingMultipartSessionError(err) {
  const msg = String(err?.message || '');
  return /not found|NoSuchUpload|aborted|expired/i.test(msg);
}

function storageErrorResponse(provider, err, request, env, { allowSessionNotFound = false } = {}) {
  if (allowSessionNotFound && isMissingMultipartSessionError(err)) {
    return jsonResponse(
      {
        error: 'انتهت جلسة الرفع المجزأ أو لم تعد موجودة على الخادم. سيتم بدء جلسة جديدة تلقائياً.',
        code: 'UPLOAD_SESSION_NOT_FOUND',
      },
      404,
      request,
      env
    );
  }
  const isB2 = provider === 'b2';
  return jsonResponse(
    {
      error: isB2
        ? 'تعذر تنفيذ العملية على خادم Backblaze B2 حالياً.'
        : 'تعذر تنفيذ العملية على خادم Cloudflare R2 حالياً.',
      code: isB2 ? 'B2_UNAVAILABLE' : 'R2_UNAVAILABLE',
      detail: err?.message,
    },
    503,
    request,
    env
  );
}

async function resolveDynamicLimits(env, idToken, fetchImpl, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedLimits && now < cachedLimitsExpiresAt) {
    return cachedLimits;
  }
  let dynamicDoc = null;
  if (idToken) {
    try {
      dynamicDoc = await fetchFirestoreDocWithToken(env, idToken, 'platformConfig/main', fetchImpl);
    } catch {
      dynamicDoc = null;
    }
  }
  const normalized = normalizeEnvLimits(env, dynamicDoc);
  cachedLimits = normalized;
  cachedLimitsExpiresAt = now + 30_000;
  return normalized;
}

export function clearLimitsCacheForTests() {
  cachedLimits = null;
  cachedLimitsExpiresAt = 0;
}

async function computeBucketUsage(bucket) {
  let cursor = undefined;
  let usedBytes = 0;
  let fileCount = 0;

  while (true) {
    const page = await bucket.list(cursor ? { cursor, limit: 1000 } : { limit: 1000 });
    for (const obj of page.objects || []) {
      usedBytes += Number(obj.size || 0);
      fileCount += 1;
    }
    if (!page.truncated || !page.cursor) break;
    cursor = page.cursor;
  }

  return { usedBytes, fileCount };
}

function formatSizeMb(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

async function requireStaff(request, env, fetchImpl) {
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return { ok: false, response: jsonResponse({ error: 'مطلوب تسجيل الدخول بحساب مشرف.' }, 401, request, env) };
  }
  try {
    const auth = await resolveStaffAuthorization(env, idToken, fetchImpl);
    if (!auth.authorized) {
      return {
        ok: false,
        response: jsonResponse({ error: 'هذا الحساب لا يملك صلاحية رفع أو إدارة الملفات.' }, 403, request, env),
      };
    }
    return { ok: true, idToken, auth };
  } catch (err) {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'تعذر التحقق من جلسة المصادقة.', code: 'AUTH_INVALID', detail: err?.message },
        401,
        request,
        env
      ),
    };
  }
}

async function checkReaderAccess(request, env, fetchImpl) {
  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return { hasToken: false, ok: true };
  }
  try {
    const reader = await verifyReaderNotBanned(env, bearerToken, fetchImpl);
    if (!reader.allowed) {
      return {
        hasToken: true,
        ok: false,
        response: jsonResponse({ error: 'حسابك موقوف أو محظور.' }, 403, request, env),
      };
    }
    return { hasToken: true, ok: true, reader };
  } catch (err) {
    const message = String(err?.message || '');
    const isServiceError =
      message.includes('Firestore REST error') ||
      message.includes('Failed to fetch Google SecureToken JWKS') ||
      err?.name === 'TypeError';
    if (isServiceError) {
      return {
        hasToken: true,
        ok: false,
        response: jsonResponse(
          { error: 'تعذر التحقق من حالة الحساب حالياً.', code: 'AUTH_CHECK_UNAVAILABLE' },
          503,
          request,
          env
        ),
      };
    }
    return {
      hasToken: true,
      ok: false,
      response: jsonResponse({ error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' }, 401, request, env),
    };
  }
}

async function handleMediaRead({ request, env, fetchImpl, path, provider }) {
  const prefix = provider === 'b2' ? '/b2/files/' : '/files/';
  const objectKey = decodeObjectKeyFromPath(path, prefix);
  if (!isValidObjectKey(objectKey)) {
    return jsonResponse({ error: 'مسار الملف غير صالح.' }, 400, request, env);
  }

  if (provider === 'r2' && !env?.MEDIA_BUCKET) {
    return jsonResponse(
      { error: 'R2 binding MEDIA_BUCKET غير مهيأ.', code: 'MEDIA_BUCKET_MISSING' },
      503,
      request,
      env
    );
  }
  if (provider === 'b2' && !hasB2Credentials(env)) {
    return jsonResponse(
      { error: 'خدمة Backblaze B2 غير مهيأة حالياً.', code: 'B2_NOT_CONFIGURED' },
      503,
      request,
      env
    );
  }

  const readMode = String(env?.READ_ACCESS_MODE || 'authenticated').trim().toLowerCase();
  const readerCheck = await checkReaderAccess(request, env, fetchImpl);
  if (!readerCheck.ok) {
    return readerCheck.response;
  }

  let headObj = null;
  let b2Client = null;
  try {
    if (provider === 'b2') {
      b2Client = createB2S3Client(env, fetchImpl);
      headObj = await b2Client.headObject(objectKey);
    } else {
      headObj = await env.MEDIA_BUCKET.head(objectKey);
    }
  } catch (err) {
    return jsonResponse(
      {
        error: provider === 'b2' ? 'تعذر الوصول إلى ملف Backblaze B2.' : 'تعذر الوصول إلى ملف Cloudflare R2.',
        code: provider === 'b2' ? 'B2_UNAVAILABLE' : 'R2_UNAVAILABLE',
        detail: err?.message,
      },
      503,
      request,
      env
    );
  }

  const isExplicitPublic =
    String(headObj?.customMetadata?.accessLevel || '').trim().toLowerCase() === 'public';

  if (readMode === 'authenticated' && !readerCheck.hasToken && !isExplicitPublic) {
    // Reject unauthenticated access uniformly with 401 whether key exists (private) or not,
    // preventing both unauthorized student media reads and key enumeration.
    return jsonResponse({ error: 'يرجى تسجيل الدخول لمشاهدة هذا الملف.' }, 401, request, env);
  }

  if (!headObj) {
    return jsonResponse(
      {
        error:
          provider === 'b2'
            ? 'الملف غير موجود في Backblaze B2.'
            : 'الملف غير موجود في Cloudflare R2.',
      },
      404,
      request,
      env
    );
  }

  const totalSize = Number(headObj.size || 0);
  const contentType = guessContentTypeFromKey(objectKey, headObj.httpMetadata?.contentType);
  const rangeHeader = request.headers.get('Range');
  const parsedRange = parseHttpRangeHeader(rangeHeader, totalSize);

  if (parsedRange.type === 'invalid' || parsedRange.type === 'unsatisfiable') {
    const headers = buildCorsHeaders(request, env, true);
    headers.set('Content-Range', `bytes */${totalSize}`);
    headers.set('Accept-Ranges', 'bytes');
    return new Response(null, { status: 416, headers });
  }

  const headers = buildCorsHeaders(request, env, true);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', isExplicitPublic ? 'public, max-age=3600' : 'private, no-store');
  if (headObj.httpEtag) {
    headers.set('ETag', headObj.httpEtag);
  } else if (headObj.etag) {
    headers.set('ETag', headObj.etag);
  }

  if (request.method === 'HEAD') {
    if (parsedRange.type === 'partial') {
      headers.set(
        'Content-Range',
        `bytes ${parsedRange.offset}-${parsedRange.end}/${parsedRange.totalSize}`
      );
      headers.set('Content-Length', String(parsedRange.length));
      return new Response(null, { status: 206, headers });
    }
    headers.set('Content-Length', String(totalSize));
    return new Response(null, { status: 200, headers });
  }

  if (provider === 'b2') {
    const forwardedRange =
      parsedRange.type === 'partial' ? `bytes=${parsedRange.offset}-${parsedRange.end}` : null;
    const b2Response = await b2Client.getObject(objectKey, forwardedRange);
    if (!b2Response) {
      return jsonResponse({ error: 'الملف غير موجود في Backblaze B2.' }, 404, request, env);
    }
    if (b2Response.status === 416) {
      headers.set('Content-Range', `bytes */${totalSize}`);
      return new Response(null, { status: 416, headers });
    }
    if (parsedRange.type === 'partial') {
      headers.set(
        'Content-Range',
        b2Response.headers.get('Content-Range') ||
          `bytes ${parsedRange.offset}-${parsedRange.end}/${parsedRange.totalSize}`
      );
      headers.set(
        'Content-Length',
        b2Response.headers.get('Content-Length') || String(parsedRange.length)
      );
      return new Response(b2Response.body, { status: 206, headers });
    }
    headers.set('Content-Length', b2Response.headers.get('Content-Length') || String(totalSize));
    return new Response(b2Response.body, { status: 200, headers });
  }

  if (parsedRange.type === 'partial') {
    const rangedObject = await env.MEDIA_BUCKET.get(objectKey, {
      range: { offset: parsedRange.offset, length: parsedRange.length },
    });
    if (!rangedObject) {
      return jsonResponse({ error: 'تعذر قراءة نطاق الملف المطلوب.' }, 404, request, env);
    }
    headers.set(
      'Content-Range',
      `bytes ${parsedRange.offset}-${parsedRange.end}/${parsedRange.totalSize}`
    );
    headers.set('Content-Length', String(parsedRange.length));
    return new Response(rangedObject.body, { status: 206, headers });
  }

  const fullObject = await env.MEDIA_BUCKET.get(objectKey);
  if (!fullObject) {
    return jsonResponse({ error: 'الملف غير موجود في Cloudflare R2.' }, 404, request, env);
  }
  headers.set('Content-Length', String(totalSize));
  return new Response(fullObject.body, { status: 200, headers });
}

export function createWorkerHandler({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        const path = url.pathname;
        const isR2Read = (request.method === 'GET' || request.method === 'HEAD') && path.startsWith('/files/');
        const isB2Read = (request.method === 'GET' || request.method === 'HEAD') && path.startsWith('/b2/files/');
        const isMediaRead = isR2Read || isB2Read;

        if (request.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: buildCorsHeaders(request, env, isMediaRead),
          });
        }

        if (request.method === 'GET' && path === '/health') {
          const limits = normalizeEnvLimits(env);
          const r2Bound = Boolean(env?.MEDIA_BUCKET);
          const primaryProvider = getDefaultProvider(env, limits);
          return jsonResponse(
            {
              ok: true,
              service: 'midad-r2-worker',
              provider: primaryProvider === 'b2' ? 'backblaze-b2' : 'cloudflare-r2',
              primaryProvider,
              readAccessMode: String(env?.READ_ACCESS_MODE || 'authenticated').trim().toLowerCase(),
              r2Bound,
              b2Bound: limits.b2CredentialsConfigured,
              verified: Boolean(limits.b2Enabled || r2Bound),
              b2Enabled: limits.b2Enabled,
              b2WorkerConfigured: limits.b2WorkerConfigured,
              b2Verified: false,
              limits,
            },
            200,
            request,
            env
          );
        }

        // ---------------------------------------------------------
        // GET / HEAD /files/* and /b2/files/*
        // ---------------------------------------------------------
        if (isMediaRead) {
          return await handleMediaRead({
            request,
            env,
            fetchImpl,
            path,
            provider: isB2Read ? 'b2' : 'r2',
          });
        }

        // ---------------------------------------------------------
        // GET /signed-url or /b2/signed-url (short-lived private B2 S3 V4 URL)
        // ---------------------------------------------------------
        if (request.method === 'GET' && (path === '/signed-url' || path === '/b2/signed-url')) {
          if (!hasB2Credentials(env)) {
            return jsonResponse(
              { error: 'خدمة Backblaze B2 غير مهيأة حالياً.', code: 'B2_NOT_CONFIGURED' },
              503,
              request,
              env
            );
          }

          const objectKey = extractB2KeyFromUrlOrParam(
            url.searchParams.get('key'),
            url.searchParams.get('url')
          );
          if (!isValidObjectKey(objectKey)) {
            return jsonResponse({ error: 'مفتاح أو رابط الملف غير صالح.' }, 400, request, env);
          }

          const readMode = String(env?.READ_ACCESS_MODE || 'authenticated').trim().toLowerCase();
          const readerCheck = await checkReaderAccess(request, env, fetchImpl);
          if (!readerCheck.ok) {
            return readerCheck.response;
          }

          const b2Client = createB2S3Client(env, fetchImpl);
          let headObj = null;
          try {
            headObj = await b2Client.headObject(objectKey);
          } catch (err) {
            return storageErrorResponse('b2', err, request, env);
          }

          const isExplicitPublic =
            String(headObj?.customMetadata?.accessLevel || '').trim().toLowerCase() === 'public';
          if (readMode === 'authenticated' && !readerCheck.hasToken && !isExplicitPublic) {
            return jsonResponse({ error: 'يرجى تسجيل الدخول للحصول على رابط التحميل المؤقت.' }, 401, request, env);
          }
          if (!headObj) {
            return jsonResponse({ error: 'الملف غير موجود في Backblaze B2.' }, 404, request, env);
          }

          const requestedExpires = Number(url.searchParams.get('expiresIn') || 300);
          const asAttachment = url.searchParams.get('download') === '1';
          const originalName = (headObj.customMetadata?.originalName || objectKey.split('/').pop() || 'file')
            .replace(/["\\\r\n]/g, '_');
          const responseContentDisposition = asAttachment
            ? `attachment; filename="${originalName}"`
            : '';

          const presigned = await b2Client.getPresignedGetUrl(objectKey, {
            expiresInSec: requestedExpires,
            responseContentDisposition,
          });

          return jsonResponse(
            {
              ok: true,
              storageProvider: 'b2',
              accessLevel: isExplicitPublic ? 'public' : 'private',
              objectKey,
              signedUrl: presigned.signedUrl,
              expiresInSec: presigned.expiresInSec,
              expiresAt: presigned.expiresAt,
              sizeBytes: Number(headObj.size || 0),
              contentType: guessContentTypeFromKey(objectKey, headObj.httpMetadata?.contentType),
            },
            200,
            request,
            env
          );
        }

        // ---------------------------------------------------------
        // All Admin / Storage Write Routes Require Staff Auth
        // ---------------------------------------------------------
        const staffCheck = await requireStaff(request, env, fetchImpl);
        if (!staffCheck.ok) {
          return staffCheck.response;
        }
        const { idToken, auth } = staffCheck;
        const forceLimitsRefresh = path === '/quota' || path === '/providers/status';
        const limits = await resolveDynamicLimits(env, idToken, fetchImpl, forceLimitsRefresh);
        const defaultProvider = getDefaultProvider(env, limits);
        const r2AllocatedBytes = limits.r2StorageLimitGb * GIB;
        const b2AllocatedBytes = limits.b2StorageLimitGb * GIB;

      if (request.method === 'GET' && (path === '/quota' || path === '/providers/status')) {
        let r2Usage = { usedBytes: 0, fileCount: 0 };
        let r2Verified = false;
        let r2Error = null;
        if (env?.MEDIA_BUCKET) {
          try {
            r2Usage = await computeBucketUsage(env.MEDIA_BUCKET);
            r2Verified = true;
          } catch (err) {
            r2Error = err?.message || 'فشل التحقق من Cloudflare R2';
          }
        }

        let b2Usage = { usedBytes: 0, fileCount: 0 };
        let b2Verified = false;
        let b2Error = null;
        if (limits.b2WorkerConfigured) {
          try {
            const b2Client = createB2S3Client(env, fetchImpl);
            b2Usage = await b2Client.computeBucketUsage();
            b2Verified = true;
          } catch (err) {
            b2Error = err?.message || 'فشل التحقق من اتصال Backblaze B2';
          }
        }

        const r2ActiveLimitBytes = r2Verified ? r2AllocatedBytes : 0;
        const r2RemainingBytes = Math.max(0, r2ActiveLimitBytes - r2Usage.usedBytes);
        const r2UsedRatio = r2ActiveLimitBytes > 0 ? r2Usage.usedBytes / r2ActiveLimitBytes : 0;

        const b2EnabledAndVerified = Boolean(limits.b2Enabled && b2Verified);
        const b2ActiveLimitBytes = b2EnabledAndVerified ? b2AllocatedBytes : 0;
        const b2RemainingBytes = Math.max(0, b2ActiveLimitBytes - b2Usage.usedBytes);
        const b2UsedRatio = b2ActiveLimitBytes > 0 ? b2Usage.usedBytes / b2ActiveLimitBytes : 0;

        const activeTotalLimitBytes = r2ActiveLimitBytes + b2ActiveLimitBytes;
        const targetTotalBytes = (env?.MEDIA_BUCKET ? r2AllocatedBytes : 0) + b2AllocatedBytes;
        const combinedUsedBytes =
          (r2Verified ? r2Usage.usedBytes : 0) + (b2EnabledAndVerified ? b2Usage.usedBytes : 0);
        const combinedFileCount =
          (r2Verified ? r2Usage.fileCount : 0) + (b2EnabledAndVerified ? b2Usage.fileCount : 0);
        const combinedRemainingBytes = Math.max(0, activeTotalLimitBytes - combinedUsedBytes);
        const primaryProvider = b2EnabledAndVerified || !env?.MEDIA_BUCKET ? 'b2' : 'r2';
        const primaryRatio = activeTotalLimitBytes > 0 ? combinedUsedBytes / activeTotalLimitBytes : 0;

        return jsonResponse(
          {
            provider: primaryProvider === 'b2' ? 'backblaze-b2' : 'cloudflare-r2',
            primaryProvider,
            verified: Boolean(b2EnabledAndVerified || r2Verified),
            r2Bound: Boolean(env?.MEDIA_BUCKET),
            b2Bound: limits.b2CredentialsConfigured,
            usedBytes: combinedUsedBytes,
            totalLimitBytes: activeTotalLimitBytes,
            targetTotalBytes,
            remainingBytes: combinedRemainingBytes,
            fileCount: combinedFileCount,
            usedPercent: Number((primaryRatio * 100).toFixed(2)),
            nearLimit: primaryRatio >= QUOTA_WARNING_RATIO,
            limits,
            r2: {
              provider: 'cloudflare-r2',
              bound: Boolean(env?.MEDIA_BUCKET),
              verified: r2Verified,
              usedBytes: r2Usage.usedBytes,
              allocatedLimitBytes: r2AllocatedBytes,
              activeLimitBytes: r2ActiveLimitBytes,
              remainingBytes: r2RemainingBytes,
              fileCount: r2Usage.fileCount,
              usedPercent: Number((r2UsedRatio * 100).toFixed(2)),
              nearLimit: r2UsedRatio >= QUOTA_WARNING_RATIO,
              error: r2Error,
            },
            b2: {
              provider: 'backblaze-b2',
              workerConfigured: limits.b2WorkerConfigured,
              credentialsConfigured: limits.b2CredentialsConfigured,
              enabled: b2EnabledAndVerified,
              verified: b2Verified,
              usedBytes: b2Usage.usedBytes,
              allocatedLimitBytes: b2AllocatedBytes,
              activeLimitBytes: b2ActiveLimitBytes,
              remainingBytes: b2RemainingBytes,
              fileCount: b2Usage.fileCount,
              usedPercent: Number((b2UsedRatio * 100).toFixed(2)),
              nearLimit: b2UsedRatio >= QUOTA_WARNING_RATIO,
              error: b2Error,
            },
          },
          200,
          request,
          env
        );
      }

      // Single-shot direct upload (<= 20 MB; multipart encouraged > 5 MB)
      if (request.method === 'POST' && path === '/upload') {
        const rawContentType = request.headers.get('Content-Type') || '';
        let fileName = '';
        let folder = 'general';
        let mimeType = '';
        let bodyBytes = null;
        let providerRaw =
          request.headers.get('X-Storage-Provider') || url.searchParams.get('provider') || '';
        let accessLevelRaw =
          request.headers.get('X-Access-Level') || url.searchParams.get('accessLevel') || '';

        if (rawContentType.includes('multipart/form-data')) {
          const form = await request.formData();
          const fileEntry = form.get('file');
          folder = String(form.get('folder') || 'general');
          providerRaw = String(form.get('provider') || providerRaw);
          accessLevelRaw = String(form.get('accessLevel') || accessLevelRaw);
          if (!fileEntry || typeof fileEntry === 'string') {
            return jsonResponse({ error: 'لم يتم إرفاق ملف في الطلب.' }, 400, request, env);
          }
          fileName = fileEntry.name || 'asset';
          mimeType = fileEntry.type || '';
          bodyBytes = await fileEntry.arrayBuffer();
        } else {
          fileName = decodeURIComponent(request.headers.get('X-File-Name') || url.searchParams.get('fileName') || '');
          folder = request.headers.get('X-Folder') || url.searchParams.get('folder') || 'general';
          mimeType = rawContentType;
          bodyBytes = await request.arrayBuffer();
        }

        const provider = resolveProviderParam(providerRaw, defaultProvider);
        if (!provider) {
          return jsonResponse({ error: 'مزود التخزين غير صالح (المسموح: b2 أو r2).' }, 400, request, env);
        }
        const accessLevel = resolveAccessLevelParam(accessLevelRaw, folder);

        const sizeBytes = bodyBytes.byteLength;
        if (!fileName || sizeBytes <= 0) {
          return jsonResponse({ error: 'الملف فارغ أو اسم الملف مفقود.' }, 400, request, env);
        }
        if (sizeBytes > MAX_SINGLE_UPLOAD_BYTES) {
          return jsonResponse(
            {
              error: 'حجم الملف يتجاوز حد الرفع المباشر المفرد (20 MB). استخدم الرفع المجزأ القابل للاستئناف.',
              code: 'USE_MULTIPART',
            },
            413,
            request,
            env
          );
        }

        const descriptor = inferMediaDescriptor(fileName, mimeType);
        if (!descriptor) {
          return jsonResponse({ error: 'صيغة أو امتداد الملف غير مدعوم.' }, 415, request, env);
        }

        const maxAllowed = getMaxBytesForKind(descriptor.mediaKind, limits);
        if (sizeBytes > maxAllowed) {
          return jsonResponse(
            {
              error: `حجم الملف (${formatSizeMb(sizeBytes)} MB) يتجاوز الحد الأقصى المسموح لهذا النوع (${formatSizeMb(maxAllowed)} MB).`,
              code: 'FILE_TOO_LARGE',
            },
            413,
            request,
            env
          );
        }

        if (provider === 'b2') {
          if (!limits.b2Enabled) {
            return jsonResponse(
              {
                error: 'خدمة Backblaze B2 غير مفعّلة أو لم تُربط مفاتيحها في Worker بعد.',
                code: 'B2_NOT_CONFIGURED',
              },
              503,
              request,
              env
            );
          }
          const b2Client = createB2S3Client(env, fetchImpl);
          let b2Usage;
          try {
            b2Usage = await b2Client.computeBucketUsage();
          } catch (err) {
            return jsonResponse(
              {
                error: 'تعذر الاتصال بحساب Backblaze B2 للتحقق من السعة.',
                code: 'B2_UNAVAILABLE',
                detail: err?.message,
              },
              503,
              request,
              env
            );
          }
          if (b2Usage.usedBytes + sizeBytes > b2AllocatedBytes) {
            return jsonResponse(
              {
                error: `حصة Backblaze B2 (${limits.b2StorageLimitGb} GB) ممتلئة ولا تكفي لرفع هذا الملف.`,
                code: 'QUOTA_EXCEEDED',
              },
              507,
              request,
              env
            );
          }

          const objectKey = buildSafeObjectKey(folder, fileName);
          try {
            await b2Client.putObject(objectKey, bodyBytes, {
              httpMetadata: { contentType: descriptor.contentType },
              customMetadata: {
                uploadedBy: auth.uid,
                mediaKind: descriptor.mediaKind,
                originalName: fileName.slice(0, 120),
                accessLevel,
              },
            });
          } catch (err) {
            return storageErrorResponse('b2', err, request, env);
          }

          const publicUrl = buildPublicMediaUrl(url.origin, 'b2', objectKey);
          return jsonResponse(
            {
              ok: true,
              storageProvider: 'b2',
              accessLevel,
              objectKey,
              publicUrl,
              sizeBytes,
              contentType: descriptor.contentType,
              mediaKind: descriptor.mediaKind,
            },
            201,
            request,
            env
          );
        }

        if (!env?.MEDIA_BUCKET) {
          return jsonResponse(
            { error: 'R2 binding MEDIA_BUCKET غير مهيأ — استخدم Backblaze B2 كمزود أساسي.', code: 'MEDIA_BUCKET_MISSING' },
            503,
            request,
            env
          );
        }

        let usage;
        try {
          usage = await computeBucketUsage(env.MEDIA_BUCKET);
        } catch (err) {
          return storageErrorResponse('r2', err, request, env);
        }
        if (usage.usedBytes + sizeBytes > r2AllocatedBytes) {
          return jsonResponse(
            {
              error: `حصة Cloudflare R2 (${limits.r2StorageLimitGb} GB) ممتلئة ولا تكفي لرفع هذا الملف.`,
              code: 'QUOTA_EXCEEDED',
            },
            507,
            request,
            env
          );
        }

        const objectKey = buildSafeObjectKey(folder, fileName);
        try {
          await env.MEDIA_BUCKET.put(objectKey, bodyBytes, {
            httpMetadata: {
              contentType: descriptor.contentType,
            },
            customMetadata: {
              uploadedBy: auth.uid,
              mediaKind: descriptor.mediaKind,
              originalName: fileName.slice(0, 120),
              accessLevel,
            },
          });
        } catch (err) {
          return storageErrorResponse('r2', err, request, env);
        }

        const publicUrl = buildPublicMediaUrl(url.origin, 'r2', objectKey);
        return jsonResponse(
          {
            ok: true,
            storageProvider: 'r2',
            accessLevel,
            objectKey,
            publicUrl,
            sizeBytes,
            contentType: descriptor.contentType,
            mediaKind: descriptor.mediaKind,
          },
          201,
          request,
          env
        );
      }

      // Multipart Step 1: Initialize Resumable Multipart Upload
      if (request.method === 'POST' && path === '/multipart/init') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'بيانات JSON غير صالحة.' }, 400, request, env);
        }

        const fileName = String(body?.fileName || '').trim();
        const contentType = String(body?.contentType || '').trim();
        const folder = String(body?.folder || 'general');
        const sizeBytes = Number(body?.sizeBytes || 0);
        const provider = resolveProviderParam(body?.provider || url.searchParams.get('provider'), defaultProvider);
        const accessLevel = resolveAccessLevelParam(body?.accessLevel, folder);

        if (!provider) {
          return jsonResponse({ error: 'مزود التخزين غير صالح (المسموح: b2 أو r2).' }, 400, request, env);
        }
        if (!fileName || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
          return jsonResponse({ error: 'بيانات الملف أو الحجم غير صالحة.' }, 400, request, env);
        }

        const descriptor = inferMediaDescriptor(fileName, contentType);
        if (!descriptor) {
          return jsonResponse({ error: 'صيغة أو امتداد الملف غير مدعوم.' }, 415, request, env);
        }

        const maxAllowed = getMaxBytesForKind(descriptor.mediaKind, limits);
        if (sizeBytes > maxAllowed) {
          return jsonResponse(
            {
              error: `حجم الملف (${formatSizeMb(sizeBytes)} MB) يتجاوز الحد الأقصى المسموح (${formatSizeMb(maxAllowed)} MB).`,
              code: 'FILE_TOO_LARGE',
            },
            413,
            request,
            env
          );
        }

        if (provider === 'b2') {
          if (!limits.b2Enabled) {
            return jsonResponse(
              {
                error: 'خدمة Backblaze B2 غير مفعّلة أو لم تُربط مفاتيحها في Worker بعد.',
                code: 'B2_NOT_CONFIGURED',
              },
              503,
              request,
              env
            );
          }
          const b2Client = createB2S3Client(env, fetchImpl);
          let b2Usage;
          try {
            b2Usage = await b2Client.computeBucketUsage();
          } catch (err) {
            return jsonResponse(
              {
                error: 'تعذر الاتصال بحساب Backblaze B2 للتحقق من السعة.',
                code: 'B2_UNAVAILABLE',
                detail: err?.message,
              },
              503,
              request,
              env
            );
          }
          if (b2Usage.usedBytes + sizeBytes > b2AllocatedBytes) {
            return jsonResponse(
              {
                error: `المساحة التخزينية المخصصة لـ Backblaze B2 (${limits.b2StorageLimitGb} GB) لا تكفي لهذا الملف.`,
                code: 'QUOTA_EXCEEDED',
              },
              507,
              request,
              env
            );
          }

          const objectKey = buildSafeObjectKey(folder, fileName);
          let multipartUpload;
          try {
            multipartUpload = await b2Client.createMultipartUpload(objectKey, {
              httpMetadata: { contentType: descriptor.contentType },
              customMetadata: {
                uploadedBy: auth.uid,
                mediaKind: descriptor.mediaKind,
                originalName: fileName.slice(0, 120),
                accessLevel,
              },
            });
          } catch (err) {
            return storageErrorResponse('b2', err, request, env);
          }

          return jsonResponse(
            {
              ok: true,
              storageProvider: 'b2',
              accessLevel,
              uploadId: multipartUpload.uploadId,
              objectKey: multipartUpload.key,
              partSizeBytes: PART_SIZE_BYTES,
              contentType: descriptor.contentType,
              mediaKind: descriptor.mediaKind,
            },
            201,
            request,
            env
          );
        }

        if (!env?.MEDIA_BUCKET) {
          return jsonResponse(
            { error: 'R2 binding MEDIA_BUCKET غير مهيأ — استخدم Backblaze B2 كمزود أساسي.', code: 'MEDIA_BUCKET_MISSING' },
            503,
            request,
            env
          );
        }

        let usage;
        try {
          usage = await computeBucketUsage(env.MEDIA_BUCKET);
        } catch (err) {
          return storageErrorResponse('r2', err, request, env);
        }
        if (usage.usedBytes + sizeBytes > r2AllocatedBytes) {
          return jsonResponse(
            {
              error: `المساحة التخزينية المخصصة لـ Cloudflare R2 (${limits.r2StorageLimitGb} GB) لا تكفي لهذا الملف.`,
              code: 'QUOTA_EXCEEDED',
            },
            507,
            request,
            env
          );
        }

        const objectKey = buildSafeObjectKey(folder, fileName);
        let multipartUpload;
        try {
          multipartUpload = await env.MEDIA_BUCKET.createMultipartUpload(objectKey, {
            httpMetadata: {
              contentType: descriptor.contentType,
            },
            customMetadata: {
              uploadedBy: auth.uid,
              mediaKind: descriptor.mediaKind,
              originalName: fileName.slice(0, 120),
              accessLevel,
            },
          });
        } catch (err) {
          return storageErrorResponse('r2', err, request, env);
        }

        return jsonResponse(
          {
            ok: true,
            storageProvider: 'r2',
            accessLevel,
            uploadId: multipartUpload.uploadId,
            objectKey: multipartUpload.key,
            partSizeBytes: PART_SIZE_BYTES,
            contentType: descriptor.contentType,
            mediaKind: descriptor.mediaKind,
          },
          201,
          request,
          env
        );
      }

      // Multipart Step 2: Upload Chunk Part
      if (request.method === 'PUT' && path === '/multipart/part') {
        const objectKey = url.searchParams.get('key') || '';
        const uploadId = url.searchParams.get('uploadId') || '';
        const partNumber = Number(url.searchParams.get('partNumber'));
        const provider = resolveProviderParam(
          url.searchParams.get('provider') || request.headers.get('X-Storage-Provider'),
          defaultProvider
        );

        if (!provider) {
          return jsonResponse({ error: 'مزود التخزين غير صالح.' }, 400, request, env);
        }
        if (!isValidObjectKey(objectKey) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
          return jsonResponse({ error: 'معاملات جزء الرفع (key/uploadId/partNumber) غير صالحة.' }, 400, request, env);
        }

        const chunkBuffer = await request.arrayBuffer();
        if (chunkBuffer.byteLength <= 0 || chunkBuffer.byteLength > PART_SIZE_BYTES * 4) {
          return jsonResponse({ error: 'حجم الجزء المرفوع غير صالح.' }, 400, request, env);
        }

        if (provider === 'b2') {
          if (!limits.b2Enabled) {
            return jsonResponse({ error: 'خدمة Backblaze B2 غير مفعّلة.', code: 'B2_NOT_CONFIGURED' }, 503, request, env);
          }
          try {
            const b2Client = createB2S3Client(env, fetchImpl);
            const uploadedPart = await b2Client.uploadPart(objectKey, uploadId, partNumber, chunkBuffer);
            return jsonResponse(
              {
                ok: true,
                storageProvider: 'b2',
                partNumber: uploadedPart.partNumber,
                etag: uploadedPart.etag,
              },
              200,
              request,
              env
            );
          } catch (err) {
            return storageErrorResponse('b2', err, request, env, { allowSessionNotFound: true });
          }
        }

        if (!env?.MEDIA_BUCKET) {
          return jsonResponse(
            { error: 'R2 binding MEDIA_BUCKET غير مهيأ — استخدم Backblaze B2 كمزود أساسي.', code: 'MEDIA_BUCKET_MISSING' },
            503,
            request,
            env
          );
        }

        try {
          const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(objectKey, uploadId);
          const uploadedPart = await multipartUpload.uploadPart(partNumber, chunkBuffer);

          return jsonResponse(
            {
              ok: true,
              storageProvider: 'r2',
              partNumber: uploadedPart.partNumber,
              etag: uploadedPart.etag,
            },
            200,
            request,
            env
          );
        } catch (err) {
          return storageErrorResponse('r2', err, request, env, { allowSessionNotFound: true });
        }
      }

      // Multipart Step 3: Complete Upload
      if (request.method === 'POST' && path === '/multipart/complete') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'بيانات JSON غير صالحة.' }, 400, request, env);
        }

        const objectKey = String(body?.objectKey || '').trim();
        const uploadId = String(body?.uploadId || '').trim();
        const parts = Array.isArray(body?.parts) ? body.parts : [];
        const provider = resolveProviderParam(body?.provider || url.searchParams.get('provider'), defaultProvider);

        if (!provider) {
          return jsonResponse({ error: 'مزود التخزين غير صالح.' }, 400, request, env);
        }
        if (!isValidObjectKey(objectKey) || !uploadId || parts.length === 0) {
          return jsonResponse({ error: 'بيانات إتمام الرفع غير مكتملة.' }, 400, request, env);
        }

        const normalizedParts = parts
          .map((p) => ({
            partNumber: Number(p?.partNumber),
            etag: String(p?.etag || '').trim(),
          }))
          .filter((p) => Number.isInteger(p.partNumber) && p.partNumber >= 1 && p.etag.length > 0)
          .sort((a, b) => a.partNumber - b.partNumber);

        if (normalizedParts.length !== parts.length) {
          return jsonResponse({ error: 'بعض أجزاء الملف غير صالحة.' }, 400, request, env);
        }

        if (provider === 'b2') {
          if (!limits.b2Enabled) {
            return jsonResponse({ error: 'خدمة Backblaze B2 غير مفعّلة.', code: 'B2_NOT_CONFIGURED' }, 503, request, env);
          }
          const b2Client = createB2S3Client(env, fetchImpl);
          let finalObj;
          try {
            finalObj = await b2Client.completeMultipartUpload(objectKey, uploadId, normalizedParts);
          } catch (err) {
            return storageErrorResponse('b2', err, request, env, { allowSessionNotFound: true });
          }
          const finalSize = Number(finalObj?.size || 0);
          const contentType = guessContentTypeFromKey(objectKey, finalObj?.httpMetadata?.contentType);
          const descriptor = inferMediaDescriptor(objectKey, contentType);
          const maxAllowed = descriptor ? getMaxBytesForKind(descriptor.mediaKind, limits) : b2AllocatedBytes;

          if (finalSize > maxAllowed) {
            await b2Client.deleteObject(objectKey).catch(() => {});
            return jsonResponse(
              {
                error: `الحجم النهائي للملف (${formatSizeMb(finalSize)} MB) يتجاوز الحد الأقصى المسموح وتم إلغاؤه.`,
                code: 'FILE_TOO_LARGE',
              },
              413,
              request,
              env
            );
          }

          const publicUrl = buildPublicMediaUrl(url.origin, 'b2', objectKey);
          return jsonResponse(
            {
              ok: true,
              storageProvider: 'b2',
              accessLevel: finalObj?.customMetadata?.accessLevel || 'private',
              objectKey,
              publicUrl,
              sizeBytes: finalSize,
              contentType,
              mediaKind: descriptor?.mediaKind || 'ATTACHMENT',
            },
            200,
            request,
            env
          );
        }

        if (!env?.MEDIA_BUCKET) {
          return jsonResponse(
            { error: 'R2 binding MEDIA_BUCKET غير مهيأ — استخدم Backblaze B2 كمزود أساسي.', code: 'MEDIA_BUCKET_MISSING' },
            503,
            request,
            env
          );
        }

        let finalObj;
        try {
          const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(objectKey, uploadId);
          finalObj = await multipartUpload.complete(normalizedParts);
        } catch (err) {
          return storageErrorResponse('r2', err, request, env, { allowSessionNotFound: true });
        }
        const finalSize = Number(finalObj?.size || 0);
        const contentType = guessContentTypeFromKey(objectKey, finalObj?.httpMetadata?.contentType);
        const descriptor = inferMediaDescriptor(objectKey, contentType);
        const maxAllowed = descriptor ? getMaxBytesForKind(descriptor.mediaKind, limits) : r2AllocatedBytes;

        if (finalSize > maxAllowed) {
          await env.MEDIA_BUCKET.delete(objectKey).catch(() => {});
          return jsonResponse(
            {
              error: `الحجم النهائي للملف (${formatSizeMb(finalSize)} MB) يتجاوز الحد الأقصى المسموح وتم إلغاؤه.`,
              code: 'FILE_TOO_LARGE',
            },
            413,
            request,
            env
          );
        }

        const publicUrl = buildPublicMediaUrl(url.origin, 'r2', objectKey);
        return jsonResponse(
          {
            ok: true,
            storageProvider: 'r2',
            accessLevel: finalObj?.customMetadata?.accessLevel || 'private',
            objectKey,
            publicUrl,
            sizeBytes: finalSize,
            contentType,
            mediaKind: descriptor?.mediaKind || 'ATTACHMENT',
          },
          200,
          request,
          env
        );
      }

      // Multipart Step 4: Abort Upload
      if (request.method === 'DELETE' && path === '/multipart/abort') {
        const objectKey = url.searchParams.get('key') || '';
        const uploadId = url.searchParams.get('uploadId') || '';
        const provider = resolveProviderParam(url.searchParams.get('provider'), defaultProvider);
        if (!provider) {
          return jsonResponse({ error: 'مزود التخزين غير صالح.' }, 400, request, env);
        }
        if (!isValidObjectKey(objectKey) || !uploadId) {
          return jsonResponse({ error: 'بيانات الإلغاء غير مكتملة.' }, 400, request, env);
        }
        if (provider === 'b2') {
          if (!hasB2Credentials(env)) {
            return jsonResponse({ error: 'خدمة Backblaze B2 غير مهيأة.', code: 'B2_NOT_CONFIGURED' }, 503, request, env);
          }
          try {
            await createB2S3Client(env, fetchImpl).abortMultipartUpload(objectKey, uploadId);
          } catch (err) {
            if (!isMissingMultipartSessionError(err)) {
              return storageErrorResponse('b2', err, request, env);
            }
          }
          return jsonResponse({ ok: true, storageProvider: 'b2', aborted: true }, 200, request, env);
        }
        if (!env?.MEDIA_BUCKET) {
          return jsonResponse(
            { error: 'R2 binding MEDIA_BUCKET غير مهيأ — استخدم Backblaze B2 كمزود أساسي.', code: 'MEDIA_BUCKET_MISSING' },
            503,
            request,
            env
          );
        }
        try {
          const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(objectKey, uploadId);
          await multipartUpload.abort();
        } catch (err) {
          if (!isMissingMultipartSessionError(err)) {
            return storageErrorResponse('r2', err, request, env);
          }
        }
        return jsonResponse({ ok: true, storageProvider: 'r2', aborted: true }, 200, request, env);
      }

      // Delete stored R2 or B2 object independently (never touches other provider)
      if (request.method === 'DELETE' && path === '/object') {
        const objectKey = url.searchParams.get('key') || '';
        const provider = resolveProviderParam(url.searchParams.get('provider'), defaultProvider);
        if (!provider) {
          return jsonResponse({ error: 'مزود التخزين غير صالح.' }, 400, request, env);
        }
        if (!isValidObjectKey(objectKey)) {
          return jsonResponse({ error: 'مفتاح الملف غير صالح.' }, 400, request, env);
        }
        if (provider === 'b2') {
          if (!hasB2Credentials(env)) {
            return jsonResponse({ error: 'خدمة Backblaze B2 غير مهيأة.', code: 'B2_NOT_CONFIGURED' }, 503, request, env);
          }
          try {
            await createB2S3Client(env, fetchImpl).deleteObject(objectKey);
          } catch (err) {
            return storageErrorResponse('b2', err, request, env);
          }
          return jsonResponse({ ok: true, storageProvider: 'b2', deletedKey: objectKey }, 200, request, env);
        }
        if (!env?.MEDIA_BUCKET) {
          return jsonResponse(
            { error: 'R2 binding MEDIA_BUCKET غير مهيأ — استخدم Backblaze B2 كمزود أساسي.', code: 'MEDIA_BUCKET_MISSING' },
            503,
            request,
            env
          );
        }
        try {
          await env.MEDIA_BUCKET.delete(objectKey);
        } catch (err) {
          return storageErrorResponse('r2', err, request, env);
        }
        return jsonResponse({ ok: true, storageProvider: 'r2', deletedKey: objectKey }, 200, request, env);
      }

        return jsonResponse({ error: 'المسار غير موجود.' }, 404, request, env);
      } catch (err) {
        return jsonResponse(
          {
            error: 'حدث خطأ غير متوقع في خادم الوسائط.',
            code: 'WORKER_INTERNAL_ERROR',
            detail: err?.message,
          },
          500,
          request,
          env
        );
      }
    },
  };
}

export default createWorkerHandler();
