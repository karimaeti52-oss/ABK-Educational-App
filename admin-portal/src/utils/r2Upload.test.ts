import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFileFingerprint,
  buildMultiProviderStorageSummary,
  DEFAULT_R2_LIMITS,
  detectR2FileSpec,
  executeResumableR2Upload,
  formatBytesReadable,
  loadSavedUploadSession,
  normalizeR2WorkerBaseUrl,
  R2UploadError,
  resolveR2StorageLimits,
  validateR2FileLimits,
  validateR2WorkerBaseUrlInput,
  verifyWorkerHealth,
  type SessionStorageLike,
} from './r2Upload.ts';

function createMemoryStorage(): SessionStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function createFakeLargeBlob(sizeBytes: number, name: string, type: string) {
  const realBlob = new Blob([new Uint8Array(Math.min(sizeBytes, 1024))], { type });
  return {
    name,
    size: sizeBytes,
    type,
    lastModified: 1700000000,
    slice(start = 0, end = sizeBytes, contentType = type) {
      const len = Math.max(0, end - start);
      return new Blob([new Uint8Array(Math.min(len, 64))], { type: contentType });
    },
    arrayBuffer: () => realBlob.arrayBuffer(),
    text: () => realBlob.text(),
    stream: () => realBlob.stream(),
    bytes: () => realBlob.bytes(),
  } as unknown as Blob & { name: string; size: number; type: string; lastModified: number };
}

test('resolveR2StorageLimits and validateR2FileLimits enforce 10 GB R2 active (until B2 enabled) and verified quota', () => {
  const defaults = resolveR2StorageLimits(undefined);
  assert.deepEqual(defaults, {
    maxVideoSizeMb: 200,
    maxPdfSizeMb: 100,
    maxImageSizeMb: 20,
    r2StorageLimitGb: 10,
    b2StorageLimitGb: 10,
    b2Enabled: false,
    totalStorageLimitGb: 10,
  });

  // Stale Firestore totalStorageLimitGb: 20 while b2Enabled: false still resolves to 10 GB active
  const staleFirestoreLimits = resolveR2StorageLimits({
    r2StorageLimitGb: 10,
    b2StorageLimitGb: 10,
    b2Enabled: false,
    totalStorageLimitGb: 20,
  });
  assert.equal(staleFirestoreLimits.totalStorageLimitGb, 10);

  // Video <= 200 MB OK, > 200 MB fails
  validateR2FileLimits(180 * 1024 * 1024, 'VIDEO', defaults);
  assert.throws(
    () => validateR2FileLimits(201 * 1024 * 1024, 'VIDEO', defaults),
    (err: unknown) => err instanceof R2UploadError && err.code === 'FILE_TOO_LARGE'
  );

  // PDF <= 100 MB OK, > 100 MB fails
  validateR2FileLimits(95 * 1024 * 1024, 'PDF', defaults);
  assert.throws(
    () => validateR2FileLimits(105 * 1024 * 1024, 'PDF', defaults),
    (err: unknown) => err instanceof R2UploadError && err.code === 'FILE_TOO_LARGE'
  );

  // Image <= 20 MB OK, > 20 MB fails
  validateR2FileLimits(19 * 1024 * 1024, 'IMAGE', defaults);
  assert.throws(
    () => validateR2FileLimits(21 * 1024 * 1024, 'IMAGE', defaults),
    (err: unknown) => err instanceof R2UploadError && err.code === 'FILE_TOO_LARGE'
  );

  // Unverified R2 quota rejects preflight upload
  assert.throws(
    () =>
      validateR2FileLimits(5 * 1024 * 1024, 'VIDEO', defaults, {
        verified: false,
        r2Bound: false,
        usedBytes: 0,
        totalLimitBytes: 10 * 1024 * 1024 * 1024,
        remainingBytes: 10 * 1024 * 1024 * 1024,
        fileCount: 0,
        usedPercent: 0,
        nearLimit: false,
        limits: defaults,
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'WORKER_NOT_CONFIGURED'
  );

  // Remaining quota overflow inside verified 10 GB R2 quota rejected
  assert.throws(
    () =>
      validateR2FileLimits(50 * 1024 * 1024, 'VIDEO', defaults, {
        verified: true,
        r2Bound: true,
        usedBytes: 9.98 * 1024 * 1024 * 1024,
        totalLimitBytes: 10 * 1024 * 1024 * 1024,
        remainingBytes: 20 * 1024 * 1024,
        fileCount: 10,
        usedPercent: 99.8,
        nearLimit: true,
        limits: defaults,
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'QUOTA_EXCEEDED'
  );
});

test('buildMultiProviderStorageSummary never marks R2 or B2 capacity active before real account verification', () => {
  const GiB = 1024 * 1024 * 1024;
  const defaults = resolveR2StorageLimits(undefined);

  // 1) Before any verification -> 0 GB verified active even though 20 GB (10+10) is targeted
  const unverifiedSummary = buildMultiProviderStorageSummary({ limits: defaults, r2Quota: null });
  assert.equal(unverifiedSummary.targetTotalBytes, 20 * GiB);
  assert.equal(unverifiedSummary.verifiedActiveTotalBytes, 0);
  assert.equal(unverifiedSummary.remainingActiveBytes, 0);
  assert.equal(unverifiedSummary.r2.allocatedBytes, 10 * GiB);
  assert.equal(unverifiedSummary.r2.activeBytes, 0);
  assert.equal(unverifiedSummary.r2.status, 'unverified');
  assert.equal(unverifiedSummary.b2.allocatedBytes, 10 * GiB);
  assert.equal(unverifiedSummary.b2.activeBytes, 0);
  assert.equal(unverifiedSummary.b2.enabled, false);
  assert.equal(unverifiedSummary.b2.status, 'disabled_unlinked');

  // 2) R2 verified with 3 GB used, B2 still disabled -> 10 GB active total, 7 GB active remaining, 17 GB target remaining
  const r2VerifiedSummary = buildMultiProviderStorageSummary({
    limits: defaults,
    r2Quota: {
      verified: true,
      r2Bound: true,
      usedBytes: 3 * GiB,
      totalLimitBytes: 10 * GiB,
      remainingBytes: 7 * GiB,
      fileCount: 14,
      usedPercent: 30,
      nearLimit: false,
      limits: defaults,
      b2: { provider: 'backblaze-b2', enabled: false, verified: false, allocatedLimitBytes: 10 * GiB, usedBytes: 0 },
    },
  });
  assert.equal(r2VerifiedSummary.verifiedActiveTotalBytes, 10 * GiB);
  assert.equal(r2VerifiedSummary.totalUsedBytes, 3 * GiB);
  assert.equal(r2VerifiedSummary.remainingActiveBytes, 7 * GiB);
  assert.equal(r2VerifiedSummary.remainingTargetBytes, 17 * GiB);
  assert.equal(r2VerifiedSummary.r2.status, 'verified');
  assert.equal(r2VerifiedSummary.b2.activeBytes, 0);
  assert.equal(r2VerifiedSummary.b2.status, 'disabled_unlinked');

  // 3) Stale Firestore b2Enabled=true WITHOUT live verified Worker response MUST NOT activate B2!
  const staleB2Limits = resolveR2StorageLimits({ b2Enabled: true });
  const staleB2Summary = buildMultiProviderStorageSummary({
    limits: staleB2Limits,
    r2Quota: {
      verified: true,
      r2Bound: true,
      usedBytes: 3 * GiB,
      totalLimitBytes: 10 * GiB,
      remainingBytes: 7 * GiB,
      fileCount: 14,
      usedPercent: 30,
      nearLimit: false,
      limits: staleB2Limits,
      b2: { provider: 'backblaze-b2', enabled: false, verified: false, allocatedLimitBytes: 10 * GiB, usedBytes: 0 },
    },
  });
  assert.equal(staleB2Summary.verifiedActiveTotalBytes, 10 * GiB);
  assert.equal(staleB2Summary.b2.enabled, false);
  assert.equal(staleB2Summary.b2.verified, false);
  assert.equal(staleB2Summary.b2.activeBytes, 0);
  assert.equal(staleB2Summary.b2.status, 'unverified');

  // 4) Only when live Worker verifies BOTH R2 AND B2 does total become 20 GB active (10 + 10)
  const bothVerifiedLimits = resolveR2StorageLimits({ b2Enabled: true });
  const bothVerifiedSummary = buildMultiProviderStorageSummary({
    limits: bothVerifiedLimits,
    r2Quota: {
      verified: true,
      r2Bound: true,
      usedBytes: 3 * GiB,
      totalLimitBytes: 20 * GiB,
      remainingBytes: 16 * GiB,
      fileCount: 14,
      usedPercent: 30,
      nearLimit: false,
      limits: bothVerifiedLimits,
      r2: {
        provider: 'cloudflare-r2',
        bound: true,
        verified: true,
        usedBytes: 3 * GiB,
        allocatedLimitBytes: 10 * GiB,
        activeLimitBytes: 10 * GiB,
        remainingBytes: 7 * GiB,
        fileCount: 14,
        usedPercent: 30,
        nearLimit: false,
      },
    },
    b2Status: {
      provider: 'backblaze-b2',
      workerConfigured: true,
      enabled: true,
      verified: true,
      allocatedLimitBytes: 10 * GiB,
      activeLimitBytes: 10 * GiB,
      usedBytes: 1 * GiB,
      remainingBytes: 9 * GiB,
    },
  });
  assert.equal(bothVerifiedSummary.verifiedActiveTotalBytes, 20 * GiB);
  assert.equal(bothVerifiedSummary.totalUsedBytes, 4 * GiB);
  assert.equal(bothVerifiedSummary.remainingActiveBytes, 16 * GiB);
  assert.equal(bothVerifiedSummary.b2.enabled, true);
  assert.equal(bothVerifiedSummary.b2.status, 'verified');
});

test('normalizeR2WorkerBaseUrl requires HTTPS (except localhost) and detects MP4/PDF specs cleanly', () => {
  assert.equal(normalizeR2WorkerBaseUrl('https://midad-r2.workers.dev///'), 'https://midad-r2.workers.dev');
  assert.equal(normalizeR2WorkerBaseUrl('http://insecure.example.com'), '');
  assert.equal(normalizeR2WorkerBaseUrl('http://localhost:8787/'), 'http://localhost:8787');

  assert.deepEqual(detectR2FileSpec({ name: 'physics.mp4', type: '' }, { videoOnly: true }), {
    mediaKind: 'VIDEO',
    contentType: 'video/mp4',
  });
  assert.equal(formatBytesReadable(20 * 1024 * 1024 * 1024), '20.00 GB');
  assert.equal(formatBytesReadable(10 * 1024 * 1024 * 1024), '10.00 GB');
});

test('executeResumableR2Upload splits >5MB MP4 into parts, auto-retries transient part failures, and resumes after pause', async () => {
  const storage = createMemoryStorage();
  const fake12MbVideo = createFakeLargeBlob(12 * 1024 * 1024, 'calculus.mp4', 'video/mp4');
  const uploadedPartsSeen: number[] = [];
  let transientFailOnce = true;
  let paused = false;

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/health')) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'midad-r2-worker',
          r2Bound: true,
          b2Enabled: false,
          b2WorkerConfigured: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.endsWith('/multipart/init')) {
      return new Response(
        JSON.stringify({
          ok: true,
          uploadId: 'up_123',
          objectKey: 'videos/up_123_calculus.mp4',
          partSizeBytes: 5 * 1024 * 1024,
        }),
        { status: 201 }
      );
    }
    if (url.includes('/multipart/part')) {
      const u = new URL(url);
      const pn = Number(u.searchParams.get('partNumber'));
      if (pn === 2 && transientFailOnce) {
        transientFailOnce = false;
        return new Response(JSON.stringify({ error: 'Temporary edge error' }), { status: 503 });
      }
      uploadedPartsSeen.push(pn);
      if (pn === 1) {
        // Trigger pause cleanly right after part 1 completes so part 2 triggers PAUSED before upload
        paused = true;
      }
      return new Response(JSON.stringify({ ok: true, partNumber: pn, etag: `"etag-${pn}"` }), {
        status: 200,
      });
    }
    if (url.endsWith('/multipart/complete')) {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.parts.length, 3);
      return new Response(
        JSON.stringify({
          ok: true,
          objectKey: body.objectKey,
          publicUrl: `https://midad-r2.workers.dev/files/${body.objectKey}`,
          sizeBytes: 12 * 1024 * 1024,
          contentType: 'video/mp4',
          mediaKind: 'VIDEO',
        }),
        { status: 200 }
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  // Run 1: uploads part 1 -> gets paused before part 2
  await assert.rejects(
    () =>
      executeResumableR2Upload({
        workerBaseUrl: 'https://midad-r2.workers.dev',
        file: fake12MbVideo,
        folder: 'videos',
        getAuthToken: async () => 'token_abc',
        limits: DEFAULT_R2_LIMITS,
        pauseController: { isPaused: () => paused },
        storage,
        fetchImpl: mockFetch,
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'PAUSED'
  );

  // Verify session persisted with part 1 saved
  const fp = buildFileFingerprint(fake12MbVideo, 'videos');
  const saved = loadSavedUploadSession(storage, fp);
  assert.ok(saved);
  assert.equal(saved.uploadedParts.length, 1);
  assert.equal(saved.uploadedParts[0].partNumber, 1);

  // Run 2 (Resume): skips part 1, retries transient failure on part 2, completes part 3!
  paused = false;
  const result = await executeResumableR2Upload({
    workerBaseUrl: 'https://midad-r2.workers.dev',
    file: fake12MbVideo,
    folder: 'videos',
    getAuthToken: async () => 'token_abc',
    limits: DEFAULT_R2_LIMITS,
    pauseController: { isPaused: () => false },
    storage,
    fetchImpl: mockFetch,
  });

  assert.equal(result.objectKey, 'videos/up_123_calculus.mp4');
  assert.equal(result.mediaKind, 'VIDEO');
  assert.deepEqual(uploadedPartsSeen, [1, 2, 3]); // Part 1 was NOT re-uploaded after resume!
  assert.equal(loadSavedUploadSession(storage, fp), null); // Session cleaned up after completion
});

test('validateR2WorkerBaseUrlInput cleans invisible chars and copied Worker paths, and detectR2FileSpec handles .ppt & MIME aliases', () => {
  const emptyRes = validateR2WorkerBaseUrlInput('   ');
  assert.equal(emptyRes.valid, false);
  assert.equal(emptyRes.reason, 'EMPTY');

  const insecureRes = validateR2WorkerBaseUrlInput('http://midad-r2-worker.example.workers.dev');
  assert.equal(insecureRes.valid, false);
  assert.equal(insecureRes.reason, 'INSECURE_PROTOCOL');

  const malformedRes = validateR2WorkerBaseUrlInput('not-a-valid-url');
  assert.equal(malformedRes.valid, false);
  assert.equal(malformedRes.reason, 'INVALID_FORMAT');

  const strippedHealth = validateR2WorkerBaseUrlInput(
    ' \u200Fhttps://midad-r2-worker.example.workers.dev/health///\n '
  );
  assert.equal(strippedHealth.valid, true);
  assert.equal(strippedHealth.normalizedUrl, 'https://midad-r2-worker.example.workers.dev');

  const strippedQuota = validateR2WorkerBaseUrlInput('https://midad-r2-worker.example.workers.dev/quota');
  assert.equal(strippedQuota.valid, true);
  assert.equal(strippedQuota.normalizedUrl, 'https://midad-r2-worker.example.workers.dev');

  const localRes = validateR2WorkerBaseUrlInput('http://localhost:8787/multipart/init');
  assert.equal(localRes.valid, true);
  assert.equal(localRes.normalizedUrl, 'http://localhost:8787');

  assert.deepEqual(detectR2FileSpec({ name: 'slides.ppt', type: '' }), {
    mediaKind: 'ATTACHMENT',
    contentType: 'application/vnd.ms-powerpoint',
  });
  assert.deepEqual(detectR2FileSpec({ name: 'book.pdf', type: 'application/x-pdf' }), {
    mediaKind: 'PDF',
    contentType: 'application/pdf',
  });
});

test('verifyWorkerHealth classifies unreachable network/CORS, wrong service, missing R2 binding, and disabled B2', async () => {
  await assert.rejects(
    () =>
      verifyWorkerHealth({
        workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'WORKER_UNREACHABLE'
  );

  await assert.rejects(
    () =>
      verifyWorkerHealth({
        workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: true, service: 'some-other-service' }), { status: 200 }),
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'WORKER_UNREACHABLE'
  );

  await assert.rejects(
    () =>
      verifyWorkerHealth({
        workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
        storageProvider: 'r2',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: false, b2Enabled: false }),
            { status: 200 }
          ),
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'STORAGE_UNAVAILABLE'
  );

  await assert.rejects(
    () =>
      verifyWorkerHealth({
        workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
        storageProvider: 'b2',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: true, b2Enabled: false }),
            { status: 200 }
          ),
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'WORKER_NOT_CONFIGURED'
  );
});

test('executeResumableR2Upload reports 401/403 explicitly and completes single-shot <5MB uploads', async () => {
  const smallImg = createFakeLargeBlob(512 * 1024, 'cover.png', 'image/png');

  await assert.rejects(
    () =>
      executeResumableR2Upload({
        workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
        file: smallImg,
        folder: 'branding',
        getAuthToken: async () => 'bad_token',
        fetchImpl: async (input) => {
          if (String(input).endsWith('/health')) {
            return new Response(
              JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: true }),
              { status: 200 }
            );
          }
          return new Response(JSON.stringify({ error: 'Token expired' }), { status: 401 });
        },
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'UNAUTHENTICATED'
  );

  await assert.rejects(
    () =>
      executeResumableR2Upload({
        workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
        file: smallImg,
        folder: 'branding',
        getAuthToken: async () => 'student_token',
        fetchImpl: async (input) => {
          if (String(input).endsWith('/health')) {
            return new Response(
              JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: true }),
              { status: 200 }
            );
          }
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        },
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'UNAUTHORIZED'
  );

  const okRes = await executeResumableR2Upload({
    workerBaseUrl: 'https://midad-r2-worker.example.workers.dev',
    file: smallImg,
    folder: 'branding',
    getAuthToken: async () => 'admin_token',
    fetchImpl: async (input) => {
      if (String(input).endsWith('/health')) {
        return new Response(
          JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: true }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          objectKey: 'branding/1_cover.png',
          publicUrl: 'https://midad-r2-worker.example.workers.dev/files/branding/1_cover.png',
          sizeBytes: 512 * 1024,
          contentType: 'image/png',
          mediaKind: 'IMAGE',
          accessLevel: 'public',
        }),
        { status: 201 }
      );
    },
  });
  assert.equal(okRes.accessLevel, 'public');
  assert.equal(okRes.mediaKind, 'IMAGE');
  assert.equal(okRes.objectKey, 'branding/1_cover.png');
});

test('executeResumableR2Upload handles >50MB files (60MB PDF & 120MB video), invalidates sessions from old Worker URLs, and recovers cleanly from expired multipart sessions', async () => {
  const storage = createMemoryStorage();
  const fp = buildFileFingerprint(
    { name: 'textbook_60mb.pdf', size: 60 * 1024 * 1024, lastModified: 1700000000 },
    'materials'
  );
  // Seed stale session pointing to a different workerBaseUrl AND an expired uploadId scenario
  storage.setItem(
    fp,
    JSON.stringify({
      fingerprint: fp,
      fileName: 'textbook_60mb.pdf',
      sizeBytes: 60 * 1024 * 1024,
      folder: 'materials',
      workerBaseUrl: 'https://old-worker.example.workers.dev',
      uploadId: 'up_stale',
      objectKey: 'materials/up_stale_textbook_60mb.pdf',
      partSizeBytes: 5 * 1024 * 1024,
      totalParts: 12,
      uploadedParts: [{ partNumber: 1, etag: '"old"' }],
      updatedAt: Date.now() - 10000,
    })
  );

  let initCount = 0;
  let expiredOnce = true;
  const pdf60Mb = createFakeLargeBlob(60 * 1024 * 1024, 'textbook_60mb.pdf', 'application/x-pdf');
  const uploadedForSession = new Map<string, number[]>();

  const pdfResult = await executeResumableR2Upload({
    workerBaseUrl: 'https://new-worker.example.workers.dev',
    file: pdf60Mb,
    folder: 'materials',
    getAuthToken: async () => 'token_admin',
    limits: DEFAULT_R2_LIMITS,
    storage,
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: true }),
          { status: 200 }
        );
      }
      if (url.endsWith('/multipart/init')) {
        initCount += 1;
        const id = `up_session_${initCount}`;
        uploadedForSession.set(id, []);
        return new Response(
          JSON.stringify({
            ok: true,
            uploadId: id,
            objectKey: `materials/${id}_textbook_60mb.pdf`,
            partSizeBytes: 5 * 1024 * 1024,
          }),
          { status: 201 }
        );
      }
      if (url.includes('/multipart/part')) {
        const u = new URL(url);
        const upId = u.searchParams.get('uploadId')!;
        const pn = Number(u.searchParams.get('partNumber'));
        if (upId === 'up_session_1' && pn === 2 && expiredOnce) {
          expiredOnce = false;
          return new Response(
            JSON.stringify({ error: 'Session expired', code: 'UPLOAD_SESSION_NOT_FOUND' }),
            { status: 404 }
          );
        }
        uploadedForSession.get(upId)?.push(pn);
        return new Response(JSON.stringify({ ok: true, partNumber: pn, etag: `"etag-${upId}-${pn}"` }), {
          status: 200,
        });
      }
      if (url.endsWith('/multipart/complete')) {
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.uploadId, 'up_session_2');
        assert.equal(body.parts.length, 12);
        return new Response(
          JSON.stringify({
            ok: true,
            objectKey: body.objectKey,
            publicUrl: `https://new-worker.example.workers.dev/files/${body.objectKey}`,
            sizeBytes: 60 * 1024 * 1024,
            contentType: 'application/pdf',
            mediaKind: 'PDF',
          }),
          { status: 200 }
        );
      }
      return new Response('Not Found', { status: 404 });
    },
  });

  assert.equal(initCount, 2); // discarded old-worker session, recovered once after UPLOAD_SESSION_NOT_FOUND
  assert.equal(pdfResult.objectKey, 'materials/up_session_2_textbook_60mb.pdf');
  assert.deepEqual(uploadedForSession.get('up_session_2'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(loadSavedUploadSession(storage, fp), null);

  // Also test 120 MB video (24 x 5MB parts) without any duplicate parts
  const video120Mb = createFakeLargeBlob(120 * 1024 * 1024, 'lecture_120mb.mp4', 'video/mp4');
  const videoParts: number[] = [];
  const videoRes = await executeResumableR2Upload({
    workerBaseUrl: 'https://new-worker.example.workers.dev',
    file: video120Mb,
    folder: 'videos',
    getAuthToken: async () => 'token_admin',
    limits: DEFAULT_R2_LIMITS,
    storage,
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({ ok: true, service: 'midad-r2-worker', r2Bound: true }),
          { status: 200 }
        );
      }
      if (url.endsWith('/multipart/init')) {
        return new Response(
          JSON.stringify({
            ok: true,
            uploadId: 'up_vid_120',
            objectKey: 'videos/up_vid_120_lecture_120mb.mp4',
            partSizeBytes: 5 * 1024 * 1024,
          }),
          { status: 201 }
        );
      }
      if (url.includes('/multipart/part')) {
        const pn = Number(new URL(url).searchParams.get('partNumber'));
        videoParts.push(pn);
        return new Response(JSON.stringify({ ok: true, partNumber: pn, etag: `"v-${pn}"` }), { status: 200 });
      }
      if (url.endsWith('/multipart/complete')) {
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.parts.length, 24);
        return new Response(
          JSON.stringify({
            ok: true,
            objectKey: body.objectKey,
            publicUrl: `https://new-worker.example.workers.dev/files/${body.objectKey}`,
            sizeBytes: 120 * 1024 * 1024,
            contentType: 'video/mp4',
            mediaKind: 'VIDEO',
          }),
          { status: 200 }
        );
      }
      return new Response('Not Found', { status: 404 });
    },
  });
  assert.equal(videoParts.length, 24);
  assert.equal(new Set(videoParts).size, 24);
  assert.equal(videoRes.mediaKind, 'VIDEO');
});

test('B2-only Worker passes verifyWorkerHealth, auto-selects b2 when storageProvider is omitted, and fails cleanly if publicUrl is missing', async () => {
  const health = await verifyWorkerHealth({
    workerBaseUrl: 'https://midad-b2-worker.example.workers.dev',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          service: 'midad-r2-worker',
          primaryProvider: 'b2',
          r2Bound: false,
          b2Bound: true,
          b2Enabled: true,
        }),
        { status: 200 }
      ),
  });
  assert.equal(health.primaryProvider, 'b2');
  assert.equal(health.b2Enabled, true);
  assert.equal(health.r2Bound, false);

  // Small <5MB PDF without explicit storageProvider routes to B2 and returns /b2/files/...
  const smallPdf = createFakeLargeBlob(512 * 1024, 'sheet.pdf', 'application/pdf');
  let capturedProviderHeader = '';
  const pdfRes = await executeResumableR2Upload({
    workerBaseUrl: 'https://midad-b2-worker.example.workers.dev',
    file: smallPdf,
    folder: 'materials',
    getAuthToken: async () => 'admin_token',
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            ok: true,
            service: 'midad-r2-worker',
            primaryProvider: 'b2',
            r2Bound: false,
            b2Bound: true,
            b2Enabled: true,
          }),
          { status: 200 }
        );
      }
      capturedProviderHeader = new Headers(init?.headers || {}).get('X-Storage-Provider') || '';
      return new Response(
        JSON.stringify({
          ok: true,
          storageProvider: 'b2',
          objectKey: 'materials/1_sheet.pdf',
          publicUrl: 'https://midad-b2-worker.example.workers.dev/b2/files/materials/1_sheet.pdf',
          sizeBytes: 512 * 1024,
          contentType: 'application/pdf',
          mediaKind: 'PDF',
        }),
        { status: 201 }
      );
    },
  });
  assert.equal(capturedProviderHeader, 'b2');
  assert.equal(pdfRes.storageProvider, 'b2');
  assert.ok(pdfRes.url.includes('/b2/files/'));

  // Large 60MB MP4 pause/resume routes cleanly to B2 without forcing R2
  const storage = createMemoryStorage();
  const largeB2Video = createFakeLargeBlob(60 * 1024 * 1024, 'optics_60mb.mp4', 'video/mp4');
  let pauseB2 = false;
  let seenInitProvider = '';
  let seenPartProvider = '';
  let seenCompleteProvider = '';

  const b2MockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/health')) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'midad-r2-worker',
          primaryProvider: 'b2',
          r2Bound: false,
          b2Bound: true,
          b2Enabled: true,
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/multipart/init')) {
      const body = JSON.parse(String(init?.body || '{}'));
      seenInitProvider = body.provider;
      return new Response(
        JSON.stringify({
          ok: true,
          storageProvider: 'b2',
          uploadId: 'b2_mp_1',
          objectKey: 'videos/b2_mp_1_optics_60mb.mp4',
          partSizeBytes: 5 * 1024 * 1024,
        }),
        { status: 201 }
      );
    }
    if (url.includes('/multipart/part')) {
      const u = new URL(url);
      seenPartProvider = u.searchParams.get('provider') || '';
      const pn = Number(u.searchParams.get('partNumber'));
      if (pn === 1) pauseB2 = true;
      return new Response(JSON.stringify({ ok: true, partNumber: pn, etag: `"b2-${pn}"` }), { status: 200 });
    }
    if (url.endsWith('/multipart/complete')) {
      const body = JSON.parse(String(init?.body || '{}'));
      seenCompleteProvider = body.provider;
      return new Response(
        JSON.stringify({
          ok: true,
          storageProvider: 'b2',
          objectKey: body.objectKey,
          publicUrl: `https://midad-b2-worker.example.workers.dev/b2/files/${body.objectKey}`,
          sizeBytes: 60 * 1024 * 1024,
          contentType: 'video/mp4',
          mediaKind: 'VIDEO',
        }),
        { status: 200 }
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    () =>
      executeResumableR2Upload({
        workerBaseUrl: 'https://midad-b2-worker.example.workers.dev',
        file: largeB2Video,
        folder: 'videos',
        getAuthToken: async () => 'admin_token',
        limits: DEFAULT_R2_LIMITS,
        pauseController: { isPaused: () => pauseB2 },
        storage,
        fetchImpl: b2MockFetch,
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'PAUSED'
  );

  pauseB2 = false;
  const resumedB2Res = await executeResumableR2Upload({
    workerBaseUrl: 'https://midad-b2-worker.example.workers.dev',
    file: largeB2Video,
    folder: 'videos',
    getAuthToken: async () => 'admin_token',
    limits: DEFAULT_R2_LIMITS,
    pauseController: { isPaused: () => false },
    storage,
    fetchImpl: b2MockFetch,
  });
  assert.equal(seenInitProvider, 'b2');
  assert.equal(seenPartProvider, 'b2');
  assert.equal(seenCompleteProvider, 'b2');
  assert.equal(resumedB2Res.storageProvider, 'b2');
  assert.ok(resumedB2Res.url.includes('/b2/files/'));

  // Missing publicUrl in server response MUST throw rather than returning broken URL
  await assert.rejects(
    () =>
      executeResumableR2Upload({
        workerBaseUrl: 'https://midad-b2-worker.example.workers.dev',
        file: smallPdf,
        folder: 'materials',
        storageProvider: 'b2',
        getAuthToken: async () => 'admin_token',
        fetchImpl: async (input) => {
          if (String(input).endsWith('/health')) {
            return new Response(
              JSON.stringify({ ok: true, service: 'midad-r2-worker', primaryProvider: 'b2', b2Enabled: true }),
              { status: 200 }
            );
          }
          return new Response(
            JSON.stringify({ ok: true, storageProvider: 'b2', objectKey: 'materials/x.pdf', publicUrl: '' }),
            { status: 201 }
          );
        },
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'UNKNOWN'
  );
});

