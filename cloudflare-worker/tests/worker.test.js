import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerHandler, clearLimitsCacheForTests } from '../src/index.js';
import { clearJwksCacheForTests } from '../src/auth.js';

function toBase64Url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function generateTestKeyPair() {
  const kp = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  publicJwk.kid = 'test-key-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateKey: kp.privateKey, publicJwk };
}

async function signTestJwt(privateKey, payload) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key-1' };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${toBase64Url(sig)}`;
}

function createMockR2Bucket(seedObjects = []) {
  const objects = new Map();
  const multipartSessions = new Map();

  for (const item of seedObjects) {
    objects.set(item.key, {
      key: item.key,
      bytes: item.bytes || new Uint8Array(item.size || 0),
      size: item.size ?? item.bytes.byteLength,
      httpMetadata: item.httpMetadata || { contentType: 'application/octet-stream' },
      customMetadata: item.customMetadata || {},
      etag: `"etag-${item.key}"`,
    });
  }

  return {
    _objects: objects,
    _multipartSessions: multipartSessions,
    async put(key, value, opts = {}) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
      const record = {
        key,
        bytes,
        size: bytes.byteLength,
        httpMetadata: opts.httpMetadata || {},
        customMetadata: opts.customMetadata || {},
        etag: `"etag-${Date.now()}"`,
      };
      objects.set(key, record);
      return record;
    },
    async head(key) {
      const rec = objects.get(key);
      if (!rec) return null;
      return {
        key: rec.key,
        size: rec.size,
        httpMetadata: rec.httpMetadata,
        customMetadata: rec.customMetadata,
        httpEtag: rec.etag,
        etag: rec.etag,
      };
    },
    async get(key, options = {}) {
      const rec = objects.get(key);
      if (!rec) return null;
      let slice = rec.bytes;
      if (options.range) {
        const start = options.range.offset || 0;
        const end = start + (options.range.length ?? rec.size - start);
        slice = rec.bytes.slice(start, end);
      }
      return {
        key: rec.key,
        size: rec.size,
        httpMetadata: rec.httpMetadata,
        httpEtag: rec.etag,
        body: new Blob([slice]).stream(),
      };
    },
    async delete(key) {
      objects.delete(key);
    },
    async list() {
      return {
        objects: Array.from(objects.values()).map((o) => ({ key: o.key, size: o.size })),
        truncated: false,
      };
    },
    async createMultipartUpload(key, opts = {}) {
      const uploadId = `mp_${crypto.randomUUID().slice(0, 8)}`;
      const session = { key, uploadId, opts, parts: new Map(), aborted: false };
      multipartSessions.set(`${key}::${uploadId}`, session);
      return this.resumeMultipartUpload(key, uploadId);
    },
    resumeMultipartUpload(key, uploadId) {
      const session = multipartSessions.get(`${key}::${uploadId}`);
      if (!session) throw new Error('Multipart session not found');
      return {
        key,
        uploadId,
        async uploadPart(partNumber, value) {
          if (session.aborted) throw new Error('Multipart upload aborted');
          const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
          const etag = `"part-${partNumber}-${bytes.byteLength}"`;
          session.parts.set(partNumber, { bytes, etag });
          return { partNumber, etag };
        },
        async complete(parts) {
          const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
          let total = 0;
          const chunks = ordered.map((p) => {
            const stored = session.parts.get(p.partNumber);
            assert.ok(stored && stored.etag === p.etag, `Missing or mismatched part ${p.partNumber}`);
            total += stored.bytes.byteLength;
            return stored.bytes;
          });
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.byteLength;
          }
          const rec = {
            key,
            bytes: merged,
            size: merged.byteLength,
            httpMetadata: session.opts.httpMetadata || {},
            customMetadata: session.opts.customMetadata || {},
            etag: `"mp-complete-${total}"`,
          };
          objects.set(key, rec);
          multipartSessions.delete(`${key}::${uploadId}`);
          return rec;
        },
        async abort() {
          session.aborted = true;
          multipartSessions.delete(`${key}::${uploadId}`);
        },
      };
    },
  };
}

function createMockB2S3Store(seedObjects = []) {
  const objects = new Map();
  const multiparts = new Map();
  for (const item of seedObjects) {
    objects.set(item.key, {
      key: item.key,
      bytes: item.bytes || new Uint8Array(0),
      size: item.size ?? (item.bytes ? item.bytes.byteLength : 0),
      contentType: item.contentType || 'application/octet-stream',
      metadata: item.metadata || {},
      etag: `"b2-${item.key}"`,
    });
  }
  return { objects, multiparts, forceErrorStatus: 0 };
}

function createMockFetch({ publicJwk, firestoreDocs = {}, firestoreErrorSuffix = null, b2Store = null }) {
  return async (url, init = {}) => {
    const strUrl = String(url);
    if (strUrl.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' },
      });
    }
    if (strUrl.includes('firestore.googleapis.com/v1/')) {
      if (firestoreErrorSuffix && strUrl.includes(firestoreErrorSuffix)) {
        return new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 500 });
      }
      for (const [suffix, fields] of Object.entries(firestoreDocs)) {
        if (strUrl.endsWith(suffix)) {
          return new Response(JSON.stringify({ fields }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }
    if (b2Store && strUrl.startsWith('https://s3.us-west-004.backblazeb2.com/')) {
      const headers = new Headers(init.headers || {});
      const authHeader = headers.get('Authorization') || '';
      assert.ok(authHeader.startsWith('AWS4-HMAC-SHA256 Credential='), 'B2 request must carry AWS4-HMAC-SHA256 SigV4');
      assert.ok(headers.get('x-amz-date'), 'B2 request must carry x-amz-date');

      if (b2Store.forceErrorStatus) {
        return new Response('B2 Service Error', { status: b2Store.forceErrorStatus });
      }

      const parsed = new URL(strUrl);
      const method = (init.method || 'GET').toUpperCase();
      const parts = parsed.pathname.split('/').filter(Boolean);
      const objectKey = parts.slice(1).map((s) => decodeURIComponent(s)).join('/');

      if (method === 'GET' && parsed.searchParams.get('list-type') === '2') {
        const itemsXml = Array.from(b2Store.objects.values())
          .map((obj) => `<Contents><Key>${obj.key}</Key><Size>${obj.size}</Size></Contents>`)
          .join('');
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated>${itemsXml}</ListBucketResult>`,
          { status: 200, headers: { 'content-type': 'application/xml' } }
        );
      }

      if (method === 'POST' && parsed.searchParams.has('uploads')) {
        const uploadId = `b2mp_${crypto.randomUUID().slice(0, 8)}`;
        b2Store.multiparts.set(uploadId, {
          key: objectKey,
          contentType: headers.get('content-type') || 'application/octet-stream',
          metadata: {
            accessLevel: headers.get('x-amz-meta-access-level') || '',
            mediaKind: headers.get('x-amz-meta-media-kind') || '',
            uploadedBy: headers.get('x-amz-meta-uploaded-by') || '',
            originalName: headers.get('x-amz-meta-original-name') || '',
          },
          parts: new Map(),
        });
        return new Response(`<InitiateMultipartUploadResult><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`, {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        });
      }

      if (method === 'PUT' && parsed.searchParams.has('uploadId')) {
        const uploadId = parsed.searchParams.get('uploadId');
        const partNumber = Number(parsed.searchParams.get('partNumber'));
        const session = b2Store.multiparts.get(uploadId);
        assert.ok(session, 'Missing B2 multipart session');
        const bytes = init.body instanceof Uint8Array ? init.body : new Uint8Array(init.body || 0);
        const etag = `"b2part-${partNumber}"`;
        session.parts.set(partNumber, { bytes, etag });
        return new Response(null, { status: 200, headers: { ETag: etag } });
      }

      if (method === 'POST' && parsed.searchParams.has('uploadId')) {
        const uploadId = parsed.searchParams.get('uploadId');
        const session = b2Store.multiparts.get(uploadId);
        assert.ok(session, 'Missing B2 multipart session');
        const bodyText = new TextDecoder().decode(init.body);
        const partNums = [...bodyText.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
        let total = 0;
        const chunks = partNums.map((n) => {
          const p = session.parts.get(n);
          assert.ok(p, `Missing part ${n}`);
          total += p.bytes.byteLength;
          return p.bytes;
        });
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        b2Store.objects.set(objectKey, {
          key: objectKey,
          bytes: merged,
          size: merged.byteLength,
          contentType: session.contentType,
          metadata: session.metadata,
          etag: `"b2mp-complete-${total}"`,
        });
        b2Store.multiparts.delete(uploadId);
        return new Response('<CompleteMultipartUploadResult/>', { status: 200 });
      }

      if (method === 'DELETE' && parsed.searchParams.has('uploadId')) {
        b2Store.multiparts.delete(parsed.searchParams.get('uploadId'));
        return new Response(null, { status: 204 });
      }

      if (method === 'PUT') {
        const bytes = init.body instanceof Uint8Array ? init.body : new Uint8Array(init.body || 0);
        const rec = {
          key: objectKey,
          bytes,
          size: bytes.byteLength,
          contentType: headers.get('content-type') || 'application/octet-stream',
          metadata: {
            accessLevel: headers.get('x-amz-meta-access-level') || '',
            mediaKind: headers.get('x-amz-meta-media-kind') || '',
            uploadedBy: headers.get('x-amz-meta-uploaded-by') || '',
            originalName: headers.get('x-amz-meta-original-name') || '',
          },
          etag: `"b2put-${bytes.byteLength}"`,
        };
        b2Store.objects.set(objectKey, rec);
        return new Response(null, { status: 200, headers: { ETag: rec.etag } });
      }

      if (method === 'HEAD') {
        const rec = b2Store.objects.get(objectKey);
        if (!rec) return new Response(null, { status: 404 });
        const respHeaders = {
          'content-length': String(rec.size),
          'content-type': rec.contentType,
          etag: rec.etag,
        };
        if (rec.metadata.accessLevel) respHeaders['x-amz-meta-access-level'] = rec.metadata.accessLevel;
        return new Response(null, { status: 200, headers: respHeaders });
      }

      if (method === 'GET') {
        const rec = b2Store.objects.get(objectKey);
        if (!rec) return new Response(null, { status: 404 });
        const range = headers.get('Range');
        if (range) {
          const m = /^bytes=(\d+)-(\d+)$/.exec(range);
          const start = Number(m[1]);
          const end = Number(m[2]);
          const slice = rec.bytes.slice(start, end + 1);
          return new Response(slice, {
            status: 206,
            headers: {
              'content-type': rec.contentType,
              'content-length': String(slice.byteLength),
              'content-range': `bytes ${start}-${end}/${rec.size}`,
            },
          });
        }
        return new Response(rec.bytes, {
          status: 200,
          headers: { 'content-type': rec.contentType, 'content-length': String(rec.size) },
        });
      }

      if (method === 'DELETE') {
        b2Store.objects.delete(objectKey);
        return new Response(null, { status: 204 });
      }
    }

    return new Response('Not Found', { status: 404 });
  };
}

const BASE_ENV = {
  FIREBASE_PROJECT_ID: 'gen-lang-client-0343268738',
  FIREBASE_DATABASE_ID: 'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d',
  ALLOWED_ORIGINS: 'https://gen-lang-client-0343268738.web.app,http://localhost:5173',
  READ_ACCESS_MODE: 'authenticated',
  DEFAULT_MAX_VIDEO_MB: '200',
  DEFAULT_MAX_PDF_MB: '100',
  DEFAULT_MAX_IMAGE_MB: '20',
  DEFAULT_R2_LIMIT_GB: '10',
  DEFAULT_TOTAL_LIMIT_GB: '10',
  DEFAULT_B2_LIMIT_GB: '10',
  B2_ENABLED: 'false',
};

function makeClaims(sub, email, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://securetoken.google.com/${BASE_ENV.FIREBASE_PROJECT_ID}`,
    aud: BASE_ENV.FIREBASE_PROJECT_ID,
    sub,
    email,
    email_verified: true,
    iat: now - 10,
    exp: now + 3600,
    ...extra,
  };
}

test('Worker protects student files by default (authenticated mode), rejects ?token= query param, and allows explicit public branding assets', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();
  const bucket = createMockR2Bucket();
  const worker = createWorkerHandler({
    fetchImpl: createMockFetch({
      publicJwk,
      firestoreDocs: {
        'documents/users/banned_student': { accountStatus: { stringValue: 'BANNED' } },
      },
    }),
  });
  const env = { ...BASE_ENV, MEDIA_BUCKET: bucket };

  const adminToken = await signTestJwt(
    privateKey,
    makeClaims('admin_1', 'admin@midad.test', { abkRole: 'SUPER_ADMIN' })
  );
  const studentToken = await signTestJwt(privateKey, makeClaims('student_1', 'student@midad.test'));
  const bannedToken = await signTestJwt(privateKey, makeClaims('banned_student', 'banned@midad.test'));

  const mp4Bytes = new Uint8Array(64);
  for (let i = 0; i < mp4Bytes.length; i += 1) mp4Bytes[i] = i;

  // Upload private student lesson MP4
  const uploadRes = await worker.fetch(
    new Request('https://r2.midad.edu/upload?fileName=lesson_01.mp4&folder=videos', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'video/mp4',
      },
      body: mp4Bytes,
    }),
    env
  );
  assert.equal(uploadRes.status, 201);
  const uploadJson = await uploadRes.json();
  assert.equal(uploadJson.accessLevel, 'private');

  // Unauthenticated access to private lesson -> 401
  const unauthLesson = await worker.fetch(new Request(uploadJson.publicUrl), env);
  assert.equal(unauthLesson.status, 401);

  // Query param ?token= must be ignored / rejected -> 401
  const queryTokenLesson = await worker.fetch(
    new Request(`${uploadJson.publicUrl}?token=${encodeURIComponent(studentToken)}`),
    env
  );
  assert.equal(queryTokenLesson.status, 401);

  // Unauthenticated access to non-existent private file -> also 401 (no enumeration)
  const unauthMissing = await worker.fetch(new Request('https://r2.midad.edu/files/videos/does_not_exist.mp4'), env);
  assert.equal(unauthMissing.status, 401);

  // Banned student -> 403
  const bannedRes = await worker.fetch(
    new Request(uploadJson.publicUrl, { headers: { Authorization: `Bearer ${bannedToken}` } }),
    env
  );
  assert.equal(bannedRes.status, 403);

  // Authenticated active student -> 200 full + 206 Partial Content
  const fullRes = await worker.fetch(
    new Request(uploadJson.publicUrl, { headers: { Authorization: `Bearer ${studentToken}` } }),
    env
  );
  assert.equal(fullRes.status, 200);
  assert.equal(fullRes.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(fullRes.headers.get('Accept-Ranges'), 'bytes');

  const rangeRes = await worker.fetch(
    new Request(uploadJson.publicUrl, {
      headers: { Authorization: `Bearer ${studentToken}`, Range: 'bytes=10-29' },
    }),
    env
  );
  assert.equal(rangeRes.status, 206);
  assert.equal(rangeRes.headers.get('Content-Range'), 'bytes 10-29/64');
  assert.deepEqual(Array.from(new Uint8Array(await rangeRes.arrayBuffer())), Array.from(mp4Bytes.slice(10, 30)));

  // Suffix range & invalid range 416
  const suffixRes = await worker.fetch(
    new Request(uploadJson.publicUrl, {
      headers: { Authorization: `Bearer ${studentToken}`, Range: 'bytes=-8' },
    }),
    env
  );
  assert.equal(suffixRes.status, 206);
  assert.equal(suffixRes.headers.get('Content-Range'), 'bytes 56-63/64');

  const badRangeRes = await worker.fetch(
    new Request(uploadJson.publicUrl, {
      headers: { Authorization: `Bearer ${studentToken}`, Range: 'bytes=999-1200' },
    }),
    env
  );
  assert.equal(badRangeRes.status, 416);

  // Public branding asset uploaded explicitly with accessLevel=public is readable without auth token
  const logoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const logoUploadRes = await worker.fetch(
    new Request('https://r2.midad.edu/upload?fileName=logo.png&folder=branding&accessLevel=public', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'image/png',
      },
      body: logoBytes,
    }),
    env
  );
  assert.equal(logoUploadRes.status, 201);
  const logoJson = await logoUploadRes.json();
  assert.equal(logoJson.accessLevel, 'public');

  const publicLogoRead = await worker.fetch(new Request(logoJson.publicUrl), env);
  assert.equal(publicLogoRead.status, 200);
  assert.equal(publicLogoRead.headers.get('Cache-Control'), 'public, max-age=3600');
});

test('Worker fails CLOSED (503) when Firestore user status check fails on media read', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();
  const bucket = createMockR2Bucket([
    { key: 'videos/lesson.mp4', bytes: new Uint8Array([1, 2, 3]), httpMetadata: { contentType: 'video/mp4' } },
  ]);
  const worker = createWorkerHandler({
    fetchImpl: createMockFetch({
      publicJwk,
      firestoreErrorSuffix: 'documents/users/student_1',
    }),
  });
  const env = { ...BASE_ENV, MEDIA_BUCKET: bucket };
  const studentToken = await signTestJwt(privateKey, makeClaims('student_1', 'student@midad.test'));

  const res = await worker.fetch(
    new Request('https://r2.midad.edu/files/videos/lesson.mp4', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }),
    env
  );
  assert.equal(res.status, 503);
});

test('Worker supports Resumable Multipart Upload (init -> parts -> complete) and abort', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();
  const bucket = createMockR2Bucket();
  const worker = createWorkerHandler({ fetchImpl: createMockFetch({ publicJwk }) });
  const env = { ...BASE_ENV, MEDIA_BUCKET: bucket };
  const adminToken = await signTestJwt(
    privateKey,
    makeClaims('admin_1', 'admin@midad.test', { abkRole: 'SUPER_ADMIN' })
  );
  const studentToken = await signTestJwt(privateKey, makeClaims('student_1', 'student@midad.test'));

  const initRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/init', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'calculus_full.mp4',
        contentType: 'video/mp4',
        folder: 'videos',
        sizeBytes: 8 * 1024 * 1024,
      }),
    }),
    env
  );
  assert.equal(initRes.status, 201);
  const initJson = await initRes.json();
  assert.equal(initJson.mediaKind, 'VIDEO');
  assert.equal(initJson.storageProvider, 'r2');

  const p1Res = await worker.fetch(
    new Request(
      `https://r2.midad.edu/multipart/part?key=${encodeURIComponent(initJson.objectKey)}&uploadId=${encodeURIComponent(initJson.uploadId)}&partNumber=1`,
      { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` }, body: new Uint8Array([1, 2, 3, 4]) }
    ),
    env
  );
  const p1 = await p1Res.json();

  const p2Res = await worker.fetch(
    new Request(
      `https://r2.midad.edu/multipart/part?key=${encodeURIComponent(initJson.objectKey)}&uploadId=${encodeURIComponent(initJson.uploadId)}&partNumber=2`,
      { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` }, body: new Uint8Array([5, 6, 7]) }
    ),
    env
  );
  const p2 = await p2Res.json();

  const completeRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectKey: initJson.objectKey,
        uploadId: initJson.uploadId,
        parts: [
          { partNumber: 2, etag: p2.etag },
          { partNumber: 1, etag: p1.etag },
        ],
      }),
    }),
    env
  );
  assert.equal(completeRes.status, 200);
  const completed = await completeRes.json();
  assert.equal(completed.sizeBytes, 7);

  const getRes = await worker.fetch(
    new Request(completed.publicUrl, { headers: { Authorization: `Bearer ${studentToken}` } }),
    env
  );
  assert.equal(getRes.status, 200);
  assert.deepEqual(Array.from(new Uint8Array(await getRes.arrayBuffer())), [1, 2, 3, 4, 5, 6, 7]);

  const init2 = await (
    await worker.fetch(
      new Request('https://r2.midad.edu/multipart/init', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'aborted.pdf',
          contentType: 'application/pdf',
          folder: 'materials',
          sizeBytes: 1024,
        }),
      }),
      env
    )
  ).json();
  const abortRes = await worker.fetch(
    new Request(
      `https://r2.midad.edu/multipart/abort?key=${encodeURIComponent(init2.objectKey)}&uploadId=${encodeURIComponent(init2.uploadId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } }
    ),
    env
  );
  assert.equal(abortRes.status, 200);
  assert.equal(bucket._multipartSessions.size, 0);
});

test('Worker strictly ignores Firestore b2Enabled=true without B2 secrets, enforces 10GB R2 alone, and handles R2/B2 quotas independently when B2 is connected & verified', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();

  const existingR2Bytes = new Uint8Array([9, 8, 7, 6]);
  const bucket = createMockR2Bucket([
    {
      key: 'videos/existing_r2_lesson.mp4',
      size: Math.round(9.95 * 1024 * 1024 * 1024),
      bytes: existingR2Bytes,
      httpMetadata: { contentType: 'video/mp4' },
    },
  ]);

  const b2Store = createMockB2S3Store([
    {
      key: 'videos/existing_b2.mp4',
      size: 1024,
      bytes: new Uint8Array([10, 20, 30, 40]),
      contentType: 'video/mp4',
    },
  ]);

  const worker = createWorkerHandler({
    fetchImpl: createMockFetch({
      publicJwk,
      b2Store,
      firestoreDocs: {
        'documents/platformConfig/main': {
          r2StorageLimitGb: { integerValue: '10' },
          b2StorageLimitGb: { integerValue: '10' },
          totalStorageLimitGb: { integerValue: '20' },
          b2Enabled: { booleanValue: true }, // Deliberately true in Firestore even before B2 secrets exist!
          maxVideoSizeMb: { integerValue: '200' },
          maxPdfSizeMb: { integerValue: '100' },
          maxImageSizeMb: { integerValue: '20' },
        },
      },
    }),
  });

  const adminToken = await signTestJwt(
    privateKey,
    makeClaims('admin_1', 'admin@midad.test', { abkRole: 'SUPER_ADMIN' })
  );
  const studentToken = await signTestJwt(privateKey, makeClaims('student_1', 'student@midad.test'));

  // Case 1: Worker has B2_ENABLED=false / no B2 credentials -> Firestore alone CANNOT enable B2!
  const envNoB2 = { ...BASE_ENV, MEDIA_BUCKET: bucket };
  const q1 = await (
    await worker.fetch(
      new Request('https://r2.midad.edu/quota', { headers: { Authorization: `Bearer ${adminToken}` } }),
      envNoB2
    )
  ).json();
  assert.equal(q1.r2.verified, true);
  assert.equal(q1.b2.enabled, false);
  assert.equal(q1.b2.verified, false);
  assert.equal(q1.totalLimitBytes, 10 * 1024 * 1024 * 1024);
  assert.equal(q1.targetTotalBytes, 20 * 1024 * 1024 * 1024);

  const b2RejectedRes = await worker.fetch(
    new Request('https://r2.midad.edu/upload?fileName=clip.mp4&folder=videos&provider=b2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'video/mp4' },
      body: new Uint8Array([1, 2, 3]),
    }),
    envNoB2
  );
  assert.equal(b2RejectedRes.status, 503);

  // Case 2: Worker connected to Backblaze B2 with verified credentials -> total becomes 20 GB (10 + 10)
  clearLimitsCacheForTests();
  const envWithB2 = {
    ...BASE_ENV,
    MEDIA_BUCKET: bucket,
    B2_ENABLED: 'true',
    B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    B2_REGION: 'us-west-004',
    B2_BUCKET_NAME: 'midad-b2-media',
    B2_KEY_ID: '004keyid',
    B2_APPLICATION_KEY: 'secret-app-key',
  };

  const q2 = await (
    await worker.fetch(
      new Request('https://r2.midad.edu/quota', { headers: { Authorization: `Bearer ${adminToken}` } }),
      envWithB2
    )
  ).json();
  assert.equal(q2.r2.verified, true);
  assert.equal(q2.b2.enabled, true);
  assert.equal(q2.b2.verified, true);
  assert.equal(q2.b2.usedBytes, 1024);
  assert.equal(q2.totalLimitBytes, 20 * 1024 * 1024 * 1024);

  // R2 is near full (9.95 GB of 10 GB) so 150MB upload on R2 fails 507, while same upload on B2 (1024 B used of 10 GB) succeeds!
  const r2FullRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/init', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'overflow.mp4', contentType: 'video/mp4', sizeBytes: 150 * 1024 * 1024, provider: 'r2' }),
    }),
    envWithB2
  );
  assert.equal(r2FullRes.status, 507);

  const b2UploadRes = await worker.fetch(
    new Request('https://r2.midad.edu/upload?fileName=new_b2.mp4&folder=videos&provider=b2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'video/mp4' },
      body: new Uint8Array([11, 22, 33, 44, 55, 66]),
    }),
    envWithB2
  );
  assert.equal(b2UploadRes.status, 201);
  const b2Uploaded = await b2UploadRes.json();
  assert.equal(b2Uploaded.storageProvider, 'b2');
  assert.ok(b2Uploaded.publicUrl.includes('/b2/files/'));

  // Authenticated student reads B2 file with Range 206; unauthenticated -> 401
  const b2Unauth = await worker.fetch(new Request(b2Uploaded.publicUrl), envWithB2);
  assert.equal(b2Unauth.status, 401);

  const b2Range = await worker.fetch(
    new Request(b2Uploaded.publicUrl, {
      headers: { Authorization: `Bearer ${studentToken}`, Range: 'bytes=1-3' },
    }),
    envWithB2
  );
  assert.equal(b2Range.status, 206);
  assert.deepEqual(Array.from(new Uint8Array(await b2Range.arrayBuffer())), [22, 33, 44]);

  // Delete B2 object independently and verify existing R2 object is completely untouched
  const delB2 = await worker.fetch(
    new Request(`https://r2.midad.edu/object?key=${encodeURIComponent(b2Uploaded.objectKey)}&provider=b2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }),
    envWithB2
  );
  assert.equal(delB2.status, 200);
  assert.ok(bucket._objects.has('videos/existing_r2_lesson.mp4'), 'Existing R2 file must remain untouched');

  // Case 3: If live B2 verification fails (500 from B2 S3), B2 drops to unverified/disabled and total reverts to 10 GB R2 only
  b2Store.forceErrorStatus = 500;
  const q3 = await (
    await worker.fetch(
      new Request('https://r2.midad.edu/quota', { headers: { Authorization: `Bearer ${adminToken}` } }),
      envWithB2
    )
  ).json();
  assert.equal(q3.b2.verified, false);
  assert.equal(q3.b2.enabled, false);
  assert.equal(q3.totalLimitBytes, 10 * 1024 * 1024 * 1024);

  // Path traversal blocked even with token
  const traversalRes = await worker.fetch(
    new Request('https://r2.midad.edu/files/%2e%2e%2fsecret.txt', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }),
    envWithB2
  );
  assert.equal(traversalRes.status, 400);

  // Disallowed origin does not receive wildcard Access-Control-Allow-Origin
  const evilCorsRes = await worker.fetch(
    new Request('https://r2.midad.edu/quota', {
      headers: { Origin: 'https://evil.example.com', Authorization: `Bearer ${adminToken}` },
    }),
    envWithB2
  );
  assert.equal(evilCorsRes.headers.get('Access-Control-Allow-Origin'), null);
});
