import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkYouTubeEmbeddability,
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
  isPermanentYouTubeErrorCode,
  isYouTubeUrl,
  mapYouTubeErrorMessage,
  toYouTubeEmbedUrl,
} from './youtube.ts';
import {
  AbkUploadError,
  checkStorageBucketAvailability,
  formatFileSizeLabel,
  mapStorageErrorToArabic,
} from '../firebase.ts';

test('extractYouTubeVideoId supports desktop, youtu.be, shorts, embed, live, and mobile URLs', () => {
  const expected = 'dQw4w9WgXcQ';
  const formats = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?app=desktop&si=123&v=dQw4w9WgXcQ&t=45s',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc&t=12',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?si=xyz&v=dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ?feature=share',
  ];

  for (const url of formats) {
    assert.equal(extractYouTubeVideoId(url), expected, `Failed for ${url}`);
    assert.equal(isYouTubeUrl(url), true, `Expected isYouTubeUrl=true for ${url}`);
  }

  assert.equal(extractYouTubeVideoId('https://example.com/video.mp4'), null);
  assert.equal(isYouTubeUrl('https://example.com/video.mp4'), false);
});

test('toYouTubeEmbedUrl generates responsive embed URL with controls, fullscreen, and autoplay=0', () => {
  const embed = toYouTubeEmbedUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ', {
    origin: 'https://abk-admin-portal.pages.dev',
  });
  assert.ok(embed);
  const parsed = new URL(embed);
  assert.equal(parsed.origin, 'https://www.youtube.com');
  assert.equal(parsed.pathname, '/embed/dQw4w9WgXcQ');
  assert.equal(parsed.searchParams.get('autoplay'), '0');
  assert.equal(parsed.searchParams.get('controls'), '1');
  assert.equal(parsed.searchParams.get('fs'), '1');
  assert.equal(parsed.searchParams.get('playsinline'), '1');
  assert.equal(parsed.searchParams.get('origin'), 'https://abk-admin-portal.pages.dev');

  assert.equal(
    getYouTubeWatchUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  );
  assert.equal(
    getYouTubeThumbnailUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
  );
  assert.match(mapYouTubeErrorMessage(150), /YT_150/);
  assert.match(mapYouTubeErrorMessage(101), /YT_101/);
  assert.match(mapYouTubeErrorMessage(152), /YT_152/);
  assert.match(mapYouTubeErrorMessage(100), /خاص|غير موجود/);
  assert.equal(isPermanentYouTubeErrorCode(150), true);
  assert.equal(isPermanentYouTubeErrorCode(101), true);
  assert.equal(isPermanentYouTubeErrorCode(100), true);
  assert.equal(isPermanentYouTubeErrorCode(2), true);
  assert.equal(isPermanentYouTubeErrorCode(152), false);
  assert.equal(isPermanentYouTubeErrorCode(5), false);
});

test('checkYouTubeEmbeddability detects embeddable videos vs owner-disabled YT_150 vs unavailable', async () => {
  const notYt = await checkYouTubeEmbeddability('https://cdn.example.com/lesson.mp4');
  assert.equal(notYt.status, 'not_youtube');
  assert.equal(notYt.blockSave, false);

  const embeddable = await checkYouTubeEmbeddability('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    fetchImpl: (async () =>
      new Response(JSON.stringify({ title: 'درس تجريبي قابل للتضمين' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
  });
  assert.equal(embeddable.status, 'embeddable');
  assert.equal(embeddable.blockSave, false);
  assert.equal(embeddable.videoId, 'dQw4w9WgXcQ');
  assert.equal(embeddable.title, 'درس تجريبي قابل للتضمين');

  for (const deniedStatus of [401, 403]) {
    const blocked = await checkYouTubeEmbeddability('https://youtu.be/M7lc1UVf-VE', {
      fetchImpl: (async () => new Response('Unauthorized', { status: deniedStatus })) as typeof fetch,
    });
    assert.equal(blocked.status, 'embed_disabled');
    assert.equal(blocked.blockSave, true);
    assert.match(blocked.messageAr, /YT_150/);
  }

  const unavailable = await checkYouTubeEmbeddability('https://youtu.be/M7lc1UVf-VE', {
    fetchImpl: (async () => new Response('Not Found', { status: 404 })) as typeof fetch,
  });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.blockSave, true);

  const networkErr = await checkYouTubeEmbeddability('https://youtu.be/M7lc1UVf-VE', {
    fetchImpl: (async () => {
      throw new Error('network down');
    }) as typeof fetch,
  });
  assert.equal(networkErr.status, 'check_failed');
  assert.equal(networkErr.blockSave, false);
});

test('mapStorageErrorToArabic and formatFileSizeLabel classify storage states accurately', () => {
  assert.equal(formatFileSizeLabel(45 * 1024), '45 KB');
  assert.equal(formatFileSizeLabel(3.5 * 1024 * 1024), '3.5 MB');

  const notFound = mapStorageErrorToArabic({ code: 'storage/bucket-not-found', message: '404' });
  assert.ok(notFound instanceof AbkUploadError);
  assert.equal(notFound.code, 'BUCKET_NOT_PROVISIONED');
  assert.equal(notFound.retryable, false);

  const denied = mapStorageErrorToArabic({ code: 'storage/unauthorized', message: 'Forbidden' });
  assert.equal(denied.code, 'UNAUTHORIZED');

  const canceled = mapStorageErrorToArabic({ code: 'storage/canceled', message: 'User canceled' });
  assert.equal(canceled.code, 'CANCELED');
  assert.equal(canceled.retryable, true);

  const timeout = mapStorageErrorToArabic({ code: 'storage/retry-limit-exceeded', message: 'timeout' });
  assert.equal(timeout.code, 'TIMEOUT_OR_CORS');
  assert.equal(timeout.retryable, true);
});

test('checkStorageBucketAvailability detects unprovisioned 404 bucket vs protected 403 bucket', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('Not Found', { status: 404 })) as typeof fetch;
    const missing = await checkStorageBucketAvailability('missing-bucket.firebasestorage.app');
    assert.equal(missing.available, false);

    globalThis.fetch = (async () => new Response('Forbidden', { status: 403 })) as typeof fetch;
    const protectedBucket = await checkStorageBucketAvailability('active-bucket.firebasestorage.app');
    assert.equal(protectedBucket.available, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
