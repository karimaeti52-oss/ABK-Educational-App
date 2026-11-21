import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFileFingerprint,
  DEFAULT_R2_LIMITS,
  detectR2FileSpec,
  executeResumableR2Upload,
  formatBytesReadable,
  loadSavedUploadSession,
  normalizeR2WorkerBaseUrl,
  R2UploadError,
  resolveR2StorageLimits,
  validateR2FileLimits,
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

test('resolveR2StorageLimits and validateR2FileLimits enforce defaults and custom quotas', () => {
  const defaults = resolveR2StorageLimits(undefined);
  assert.deepEqual(defaults, {
    maxVideoSizeMb: 200,
    maxPdfSizeMb: 100,
    maxImageSizeMb: 20,
    totalStorageLimitGb: 25,
  });

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

  // Remaining quota overflow rejected
  assert.throws(
    () =>
      validateR2FileLimits(50 * 1024 * 1024, 'VIDEO', defaults, {
        usedBytes: 24.98 * 1024 * 1024 * 1024,
        totalLimitBytes: 25 * 1024 * 1024 * 1024,
        remainingBytes: 20 * 1024 * 1024,
        fileCount: 10,
        usedPercent: 99.9,
        nearLimit: true,
        limits: defaults,
      }),
    (err: unknown) => err instanceof R2UploadError && err.code === 'QUOTA_EXCEEDED'
  );
});

test('normalizeR2WorkerBaseUrl requires HTTPS (except localhost) and detects MP4/PDF specs cleanly', () => {
  assert.equal(normalizeR2WorkerBaseUrl('https://midad-r2.workers.dev///'), 'https://midad-r2.workers.dev');
  assert.equal(normalizeR2WorkerBaseUrl('http://insecure.example.com'), '');
  assert.equal(normalizeR2WorkerBaseUrl('http://localhost:8787/'), 'http://localhost:8787');

  assert.deepEqual(detectR2FileSpec({ name: 'physics.mp4', type: '' }, { videoOnly: true }), {
    mediaKind: 'VIDEO',
    contentType: 'video/mp4',
  });
  assert.equal(formatBytesReadable(25 * 1024 * 1024 * 1024), '25.00 GB');
});

test('executeResumableR2Upload splits >5MB MP4 into parts, auto-retries transient part failures, and resumes after pause', async () => {
  const storage = createMemoryStorage();
  const fake12MbVideo = createFakeLargeBlob(12 * 1024 * 1024, 'calculus.mp4', 'video/mp4');
  const uploadedPartsSeen: number[] = [];
  let transientFailOnce = true;
  let paused = false;

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
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
