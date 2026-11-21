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

function createMockFetch({ publicJwk, firestoreDocs = {} }) {
  return async (url) => {
    const strUrl = String(url);
    if (strUrl.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' },
      });
    }
    if (strUrl.includes('firestore.googleapis.com/v1/')) {
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
    return new Response('Not Found', { status: 404 });
  };
}

const BASE_ENV = {
  FIREBASE_PROJECT_ID: 'gen-lang-client-0343268738',
  FIREBASE_DATABASE_ID: 'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d',
  SUPER_ADMIN_EMAIL: 'karimaeti07@gmail.com',
  ALLOWED_ORIGINS: 'https://gen-lang-client-0343268738.web.app,http://localhost:5173',
  READ_ACCESS_MODE: 'public',
  DEFAULT_MAX_VIDEO_MB: '200',
  DEFAULT_MAX_PDF_MB: '100',
  DEFAULT_MAX_IMAGE_MB: '20',
  DEFAULT_TOTAL_LIMIT_GB: '25',
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

test('Worker uploads MP4 video and serves HTTP 206 Partial Content Range requests accurately', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();
  const bucket = createMockR2Bucket();
  const worker = createWorkerHandler({ fetchImpl: createMockFetch({ publicJwk }) });
  const env = { ...BASE_ENV, MEDIA_BUCKET: bucket };

  const adminToken = await signTestJwt(privateKey, makeClaims('admin_1', 'karimaeti07@gmail.com'));
  const mp4Bytes = new Uint8Array(64);
  for (let i = 0; i < mp4Bytes.length; i += 1) mp4Bytes[i] = i;

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
  assert.equal(uploadRes.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  const uploadJson = await uploadRes.json();
  assert.equal(uploadJson.ok, true);
  assert.equal(uploadJson.mediaKind, 'VIDEO');
  assert.equal(uploadJson.sizeBytes, 64);

  // Full fetch
  const fullRes = await worker.fetch(new Request(uploadJson.publicUrl), env);
  assert.equal(fullRes.status, 200);
  assert.equal(fullRes.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(fullRes.headers.get('Content-Type'), 'video/mp4');
  assert.equal(fullRes.headers.get('Content-Length'), '64');

  // Partial Content Range (seeking middle of MP4)
  const rangeRes = await worker.fetch(
    new Request(uploadJson.publicUrl, { headers: { Range: 'bytes=10-29' } }),
    env
  );
  assert.equal(rangeRes.status, 206);
  assert.equal(rangeRes.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(rangeRes.headers.get('Content-Range'), 'bytes 10-29/64');
  assert.equal(rangeRes.headers.get('Content-Length'), '20');
  const sliced = new Uint8Array(await rangeRes.arrayBuffer());
  assert.deepEqual(Array.from(sliced), Array.from(mp4Bytes.slice(10, 30)));

  // Suffix range & invalid range 416
  const suffixRes = await worker.fetch(
    new Request(uploadJson.publicUrl, { headers: { Range: 'bytes=-8' } }),
    env
  );
  assert.equal(suffixRes.status, 206);
  assert.equal(suffixRes.headers.get('Content-Range'), 'bytes 56-63/64');

  const badRangeRes = await worker.fetch(
    new Request(uploadJson.publicUrl, { headers: { Range: 'bytes=999-1200' } }),
    env
  );
  assert.equal(badRangeRes.status, 416);
});

test('Worker supports Resumable Multipart Upload (init -> parts -> complete) and abort', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();
  const bucket = createMockR2Bucket();
  const worker = createWorkerHandler({ fetchImpl: createMockFetch({ publicJwk }) });
  const env = { ...BASE_ENV, MEDIA_BUCKET: bucket };
  const adminToken = await signTestJwt(privateKey, makeClaims('admin_1', 'karimaeti07@gmail.com'));

  // Init 8MB video upload
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
  assert.ok(initJson.uploadId);

  const part1Data = new Uint8Array([1, 2, 3, 4]);
  const part2Data = new Uint8Array([5, 6, 7]);
  const p1Res = await worker.fetch(
    new Request(
      `https://r2.midad.edu/multipart/part?key=${encodeURIComponent(initJson.objectKey)}&uploadId=${encodeURIComponent(initJson.uploadId)}&partNumber=1`,
      { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` }, body: part1Data }
    ),
    env
  );
  assert.equal(p1Res.status, 200);
  const p1 = await p1Res.json();

  const p2Res = await worker.fetch(
    new Request(
      `https://r2.midad.edu/multipart/part?key=${encodeURIComponent(initJson.objectKey)}&uploadId=${encodeURIComponent(initJson.uploadId)}&partNumber=2`,
      { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` }, body: part2Data }
    ),
    env
  );
  assert.equal(p2Res.status, 200);
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

  // Verify merged object readable via GET
  const getRes = await worker.fetch(new Request(completed.publicUrl), env);
  assert.deepEqual(Array.from(new Uint8Array(await getRes.arrayBuffer())), [1, 2, 3, 4, 5, 6, 7]);

  // Test Abort flow cleans up session
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

test('Worker enforces per-type limits (200MB video / 100MB PDF / 20MB image), 25GB quota, RBAC & security', async () => {
  clearJwksCacheForTests();
  clearLimitsCacheForTests();
  const { privateKey, publicJwk } = await generateTestKeyPair();

  // Seed bucket with 22 GB (88% of 25 GB -> triggers nearLimit alert)
  const seeded22Gb = 22 * 1024 * 1024 * 1024;
  const bucket = createMockR2Bucket([
    {
      key: 'videos/existing_archive.mp4',
      size: seeded22Gb,
      bytes: new Uint8Array(16),
      httpMetadata: { contentType: 'video/mp4' },
    },
  ]);

  const worker = createWorkerHandler({
    fetchImpl: createMockFetch({
      publicJwk,
      firestoreDocs: {
        'documents/users/banned_student': { accountStatus: { stringValue: 'BANNED' } },
      },
    }),
  });
  const env = { ...BASE_ENV, MEDIA_BUCKET: bucket };

  const adminToken = await signTestJwt(privateKey, makeClaims('admin_1', 'karimaeti07@gmail.com'));
  const studentToken = await signTestJwt(privateKey, makeClaims('student_1', 'student@example.com'));
  const bannedToken = await signTestJwt(privateKey, makeClaims('banned_student', 'banned@example.com'));

  // Student blocked from /quota and /multipart/init
  const unauthRes = await worker.fetch(new Request('https://r2.midad.edu/quota'), env);
  assert.equal(unauthRes.status, 401);

  const studentQuotaRes = await worker.fetch(
    new Request('https://r2.midad.edu/quota', { headers: { Authorization: `Bearer ${studentToken}` } }),
    env
  );
  assert.equal(studentQuotaRes.status, 403);

  // Admin reads /quota and sees nearLimit = true (88%)
  const quotaRes = await worker.fetch(
    new Request('https://r2.midad.edu/quota', { headers: { Authorization: `Bearer ${adminToken}` } }),
    env
  );
  assert.equal(quotaRes.status, 200);
  const quotaJson = await quotaRes.json();
  assert.equal(quotaJson.nearLimit, true);
  assert.equal(quotaJson.limits.maxVideoSizeMb, 200);

  // Reject video > 200 MB
  const bigVideoRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/init', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'huge.mp4', contentType: 'video/mp4', sizeBytes: 250 * 1024 * 1024 }),
    }),
    env
  );
  assert.equal(bigVideoRes.status, 413);

  // Reject PDF > 100 MB
  const bigPdfRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/init', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'huge.pdf', contentType: 'application/pdf', sizeBytes: 120 * 1024 * 1024 }),
    }),
    env
  );
  assert.equal(bigPdfRes.status, 413);

  // Reject Image > 20 MB
  const bigImgRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/init', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'huge.png', contentType: 'image/png', sizeBytes: 25 * 1024 * 1024 }),
    }),
    env
  );
  assert.equal(bigImgRes.status, 413);

  // Reject valid 150MB video when remaining quota is only 3GB? Wait: 22GB + 4GB > 25GB: add a 2.95GB object -> 24.95GB used, then 150MB fails with 507 QUOTA_EXCEEDED
  bucket._objects.set('videos/almost_full.mp4', {
    key: 'videos/almost_full.mp4',
    size: Math.round(2.95 * 1024 * 1024 * 1024),
    bytes: new Uint8Array(8),
    httpMetadata: { contentType: 'video/mp4' },
  });
  const overflowRes = await worker.fetch(
    new Request('https://r2.midad.edu/multipart/init', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'overflow.mp4', contentType: 'video/mp4', sizeBytes: 150 * 1024 * 1024 }),
    }),
    env
  );
  assert.equal(overflowRes.status, 507);

  // Path traversal blocked
  const traversalRes = await worker.fetch(
    new Request('https://r2.midad.edu/files/%2e%2e%2fsecret.txt'),
    env
  );
  assert.equal(traversalRes.status, 400);

  // Banned student blocked from /files/* when forwarding token
  const bannedReadRes = await worker.fetch(
    new Request('https://r2.midad.edu/files/videos/existing_archive.mp4', {
      headers: { Authorization: `Bearer ${bannedToken}` },
    }),
    env
  );
  assert.equal(bannedReadRes.status, 403);

  // Disallowed origin does not receive wildcard Access-Control-Allow-Origin
  const evilCorsRes = await worker.fetch(
    new Request('https://r2.midad.edu/quota', {
      headers: { Origin: 'https://evil.example.com', Authorization: `Bearer ${adminToken}` },
    }),
    env
  );
  assert.equal(evilCorsRes.headers.get('Access-Control-Allow-Origin'), null);
});
