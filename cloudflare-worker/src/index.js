import {
  fetchFirestoreDocWithToken,
  resolveStaffAuthorization,
  verifyReaderNotBanned,
} from './auth.js';
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

let cachedLimits = null;
let cachedLimitsExpiresAt = 0;

function encodeObjectKeySegments(objectKey) {
  return objectKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function decodeObjectKeyFromPath(pathname) {
  const raw = pathname.replace(/^\/files\/+/, '');
  if (!raw) return '';
  const decoded = raw
    .split('/')
    .map((seg) => decodeURIComponent(seg))
    .join('/');
  return decoded;
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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range, X-File-Name, X-Folder, X-File-Size',
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

async function resolveDynamicLimits(env, idToken, fetchImpl) {
  const now = Date.now();
  if (cachedLimits && now < cachedLimitsExpiresAt) {
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

export function createWorkerHandler({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;
      const isMediaRead = (request.method === 'GET' || request.method === 'HEAD') && path.startsWith('/files/');

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: buildCorsHeaders(request, env, isMediaRead),
        });
      }

      if (!env?.MEDIA_BUCKET && path !== '/health') {
        return jsonResponse({ error: 'R2 binding MEDIA_BUCKET غير مهيأ.' }, 500, request, env);
      }

      if (request.method === 'GET' && path === '/health') {
        return jsonResponse(
          {
            ok: true,
            service: 'midad-r2-worker',
            r2Bound: Boolean(env?.MEDIA_BUCKET),
            limits: normalizeEnvLimits(env),
          },
          200,
          request,
          env
        );
      }

      // ---------------------------------------------------------
      // GET / HEAD /files/*  (ExoPlayer, PdfViewer, Admin preview)
      // Support HTTP Range (206 Partial Content), Accept-Ranges, CORS
      // ---------------------------------------------------------
      if (isMediaRead) {
        const readMode = String(env?.READ_ACCESS_MODE || 'public').toLowerCase();
        const bearerToken = extractBearerToken(request) || url.searchParams.get('token');

        if (readMode === 'authenticated') {
          if (!bearerToken) {
            return jsonResponse({ error: 'يرجى تسجيل الدخول لمشاهدة هذا الملف.' }, 401, request, env);
          }
          try {
            const reader = await verifyReaderNotBanned(env, bearerToken, fetchImpl);
            if (!reader.allowed) {
              return jsonResponse({ error: 'حسابك موقوف أو محظور.' }, 403, request, env);
            }
          } catch {
            return jsonResponse({ error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' }, 401, request, env);
          }
        } else if (bearerToken) {
          // Even in public key mode, if the app forwards an authenticated student token for a banned user, block access
          try {
            const reader = await verifyReaderNotBanned(env, bearerToken, fetchImpl);
            if (!reader.allowed) {
              return jsonResponse({ error: 'حسابك موقوف أو محظور.' }, 403, request, env);
            }
          } catch {
            // Ignore malformed optional token in public object mode
          }
        }

        const objectKey = decodeObjectKeyFromPath(path);
        if (!isValidObjectKey(objectKey)) {
          return jsonResponse({ error: 'مسار الملف غير صالح.' }, 400, request, env);
        }

        const headObj = await env.MEDIA_BUCKET.head(objectKey);
        if (!headObj) {
          return jsonResponse({ error: 'الملف غير موجود في Cloudflare R2.' }, 404, request, env);
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
        headers.set('Cache-Control', 'public, max-age=3600');
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

      // ---------------------------------------------------------
      // All Admin / Storage Write Routes Require Staff Auth
      // ---------------------------------------------------------
      const staffCheck = await requireStaff(request, env, fetchImpl);
      if (!staffCheck.ok) {
        return staffCheck.response;
      }
      const { idToken, auth } = staffCheck;
      const limits = await resolveDynamicLimits(env, idToken, fetchImpl);
      const totalLimitBytes = limits.totalStorageLimitGb * 1024 * 1024 * 1024;

      if (request.method === 'GET' && path === '/quota') {
        const usage = await computeBucketUsage(env.MEDIA_BUCKET);
        const remainingBytes = Math.max(0, totalLimitBytes - usage.usedBytes);
        const usedRatio = totalLimitBytes > 0 ? usage.usedBytes / totalLimitBytes : 0;
        return jsonResponse(
          {
            usedBytes: usage.usedBytes,
            totalLimitBytes,
            remainingBytes,
            fileCount: usage.fileCount,
            usedPercent: Number((usedRatio * 100).toFixed(2)),
            nearLimit: usedRatio >= QUOTA_WARNING_RATIO,
            limits,
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

        if (rawContentType.includes('multipart/form-data')) {
          const form = await request.formData();
          const fileEntry = form.get('file');
          folder = String(form.get('folder') || 'general');
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

        const usage = await computeBucketUsage(env.MEDIA_BUCKET);
        if (usage.usedBytes + sizeBytes > totalLimitBytes) {
          return jsonResponse(
            {
              error: 'المساحة التخزينية الإجمالية (Quota) ممتلئة ولا تكفي لرفع هذا الملف.',
              code: 'QUOTA_EXCEEDED',
            },
            507,
            request,
            env
          );
        }

        const objectKey = buildSafeObjectKey(folder, fileName);
        await env.MEDIA_BUCKET.put(objectKey, bodyBytes, {
          httpMetadata: {
            contentType: descriptor.contentType,
          },
          customMetadata: {
            uploadedBy: auth.uid,
            mediaKind: descriptor.mediaKind,
            originalName: fileName.slice(0, 120),
          },
        });

        const publicUrl = `${url.origin}/files/${encodeObjectKeySegments(objectKey)}`;
        return jsonResponse(
          {
            ok: true,
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

        const usage = await computeBucketUsage(env.MEDIA_BUCKET);
        if (usage.usedBytes + sizeBytes > totalLimitBytes) {
          return jsonResponse(
            {
              error: 'المساحة التخزينية الإجمالية (25 GB أو الحد المحدد) لا تكفي لهذا الملف.',
              code: 'QUOTA_EXCEEDED',
            },
            507,
            request,
            env
          );
        }

        const objectKey = buildSafeObjectKey(folder, fileName);
        const multipartUpload = await env.MEDIA_BUCKET.createMultipartUpload(objectKey, {
          httpMetadata: {
            contentType: descriptor.contentType,
          },
          customMetadata: {
            uploadedBy: auth.uid,
            mediaKind: descriptor.mediaKind,
            originalName: fileName.slice(0, 120),
          },
        });

        return jsonResponse(
          {
            ok: true,
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

        if (!isValidObjectKey(objectKey) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
          return jsonResponse({ error: 'معاملات جزء الرفع (key/uploadId/partNumber) غير صالحة.' }, 400, request, env);
        }

        const chunkBuffer = await request.arrayBuffer();
        if (chunkBuffer.byteLength <= 0 || chunkBuffer.byteLength > PART_SIZE_BYTES * 4) {
          return jsonResponse({ error: 'حجم الجزء المرفوع غير صالح.' }, 400, request, env);
        }

        const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(objectKey, uploadId);
        const uploadedPart = await multipartUpload.uploadPart(partNumber, chunkBuffer);

        return jsonResponse(
          {
            ok: true,
            partNumber: uploadedPart.partNumber,
            etag: uploadedPart.etag,
          },
          200,
          request,
          env
        );
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

        const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(objectKey, uploadId);
        const finalObj = await multipartUpload.complete(normalizedParts);
        const finalSize = Number(finalObj?.size || 0);
        const contentType = guessContentTypeFromKey(objectKey, finalObj?.httpMetadata?.contentType);
        const descriptor = inferMediaDescriptor(objectKey, contentType);
        const maxAllowed = descriptor ? getMaxBytesForKind(descriptor.mediaKind, limits) : totalLimitBytes;

        if (finalSize > maxAllowed) {
          await env.MEDIA_BUCKET.delete(objectKey);
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

        const publicUrl = `${url.origin}/files/${encodeObjectKeySegments(objectKey)}`;
        return jsonResponse(
          {
            ok: true,
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
        if (!isValidObjectKey(objectKey) || !uploadId) {
          return jsonResponse({ error: 'بيانات الإلغاء غير مكتملة.' }, 400, request, env);
        }
        const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(objectKey, uploadId);
        await multipartUpload.abort();
        return jsonResponse({ ok: true, aborted: true }, 200, request, env);
      }

      // Delete stored R2 object (content/admin cleanup)
      if (request.method === 'DELETE' && path === '/object') {
        const objectKey = url.searchParams.get('key') || '';
        if (!isValidObjectKey(objectKey)) {
          return jsonResponse({ error: 'مفتاح الملف غير صالح.' }, 400, request, env);
        }
        await env.MEDIA_BUCKET.delete(objectKey);
        return jsonResponse({ ok: true, deletedKey: objectKey }, 200, request, env);
      }

      return jsonResponse({ error: 'المسار غير موجود.' }, 404, request, env);
    },
  };
}

export default createWorkerHandler();
