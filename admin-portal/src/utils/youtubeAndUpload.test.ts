import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
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
  assert.match(mapYouTubeErrorMessage(150), /التضمين/);
  assert.match(mapYouTubeErrorMessage(100), /خاص|غير موجود/);
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
