const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts a valid 11-character YouTube video ID from all common desktop, mobile,
 * shorts, embed, live, and shortened URL formats while leaving the original URL untouched.
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate) && /(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const seg = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (VIDEO_ID_REGEX.test(seg)) return seg;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const vParam = parsed.searchParams.get('v')?.trim() || '';
      if (VIDEO_ID_REGEX.test(vParam)) return vParam;

      const segments = parsed.pathname.split('/').filter(Boolean);
      // Support /embed/ID, /shorts/ID, /live/ID, /v/ID, /e/ID
      if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v', 'e'].includes(segments[0])) {
        const id = segments[1].trim();
        if (VIDEO_ID_REGEX.test(id)) return id;
      }
    }
  } catch {
    // Fall back to regex parsing below for non-standard URL inputs
  }

  const fallbackMatch = trimmed.match(
    /(?:youtu\.be\/|(?:m\.|www\.|music\.)?youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/|watch\?(?:[^#]*&)?v=))([a-zA-Z0-9_-]{11})/
  );
  if (fallbackMatch?.[1] && VIDEO_ID_REGEX.test(fallbackMatch[1])) {
    return fallbackMatch[1];
  }

  return null;
}

export function isYouTubeUrl(rawUrl: string): boolean {
  return extractYouTubeVideoId(rawUrl) !== null;
}

export interface YouTubeEmbedOptions {
  origin?: string;
  useNoCookie?: boolean;
}

/**
 * Converts any valid YouTube link to a safe Embed URL with controls enabled,
 * fullscreen enabled, and autoplay explicitly disabled (autoplay=0).
 */
export function toYouTubeEmbedUrl(
  rawUrl: string,
  options: YouTubeEmbedOptions = {}
): string | null {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) return null;

  const domain = options.useNoCookie
    ? 'https://www.youtube-nocookie.com'
    : 'https://www.youtube.com';

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    controls: '1',
    fs: '1',
    autoplay: '0',
    enablejsapi: '1',
  });

  const resolvedOrigin =
    options.origin ??
    (typeof window !== 'undefined' && /^https?:\/\//i.test(window.location.origin)
      ? window.location.origin
      : undefined);

  if (resolvedOrigin) {
    params.set('origin', resolvedOrigin);
  }

  return `${domain}/embed/${videoId}?${params.toString()}`;
}

export function getYouTubeWatchUrl(rawUrl: string): string {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return (rawUrl || '').trim();
}

export function getYouTubeThumbnailUrl(rawUrl: string): string | null {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export type YouTubeEmbedCheckStatus =
  | 'not_youtube'
  | 'embeddable'
  | 'embed_disabled'
  | 'unavailable'
  | 'check_failed';

export interface YouTubeEmbedCheckResult {
  status: YouTubeEmbedCheckStatus;
  videoId: string | null;
  title?: string;
  messageAr: string;
  blockSave: boolean;
}

export function isPermanentYouTubeErrorCode(errorCode: number): boolean {
  return errorCode === 2 || errorCode === 100 || errorCode === 101 || errorCode === 150;
}

export async function checkYouTubeEmbeddability(
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; oEmbedEndpoint?: string } = {}
): Promise<YouTubeEmbedCheckResult> {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    return {
      status: 'not_youtube',
      videoId: null,
      messageAr: '',
      blockSave: false,
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const endpoint = options.oEmbedEndpoint ?? 'https://www.youtube.com/oembed';
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const requestUrl = `${endpoint}?url=${encodeURIComponent(watchUrl)}&format=json`;

  try {
    const response = await fetchImpl(requestUrl, { method: 'GET' });
    if (response.status === 200) {
      let title: string | undefined;
      try {
        const data = (await response.json()) as { title?: string };
        title = data.title?.trim() || undefined;
      } catch {
        // Ignore JSON parse details on 200 OK
      }
      return {
        status: 'embeddable',
        videoId,
        title,
        messageAr: 'الفيديو متاح ويسمح صاحبه بالتضمين داخل تطبيق الطلاب.',
        blockSave: false,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'embed_disabled',
        videoId,
        messageAr:
          'مالك الفيديو منع تشغيله بالتضمين خارج تطبيق YouTube (YT_150). لن يعمل داخل تطبيق Android للطلاب؛ يرجى اختيار فيديو يسمح بالتضمين أو رفعه بصيغة MP4.',
        blockSave: true,
      };
    }

    if (response.status === 400 || response.status === 404) {
      return {
        status: 'unavailable',
        videoId,
        messageAr: 'هذا الفيديو خاص أو غير متاح على YouTube ولن يعمل للطلاب داخل التطبيق.',
        blockSave: true,
      };
    }

    return {
      status: 'check_failed',
      videoId,
      messageAr: `تعذر التحقق التلقائي من صلاحية التضمين (HTTP ${response.status})؛ تأكد من المعاينة قبل النشر.`,
      blockSave: false,
    };
  } catch {
    return {
      status: 'check_failed',
      videoId,
      messageAr: 'تعذر فحص صلاحية التضمين تلقائياً؛ تأكد من المعاينة قبل حفظ الدرس للطلاب.',
      blockSave: false,
    };
  }
}

export function mapYouTubeErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case 2:
      return 'معرّف فيديو YouTube غير صالح أو الرابط تالف.';
    case 5:
      return 'تعذر تشغيل الفيديو داخل مشغل HTML5 في هذا المتصفح.';
    case 100:
      return 'هذا الفيديو غير موجود أو تم حذفه أو ضبطه كفيديو خاص.';
    case 101:
    case 150:
      return `صاحب الفيديو منع تشغيله بالتضمين خارج تطبيق YouTube (YT_${errorCode})، ولن يعمل داخل تطبيق الطلاب.`;
    case 152:
    case 153:
      return `رفض مشغل التضمين تهيئة التشغيل في المتصفح الحالي (YT_${errorCode}).`;
    default:
      return 'تعذر تشغيل الفيديو داخل المشغل المضمّن حالياً.';
  }
}
