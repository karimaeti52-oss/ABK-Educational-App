import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Play, X } from 'lucide-react';
import { firebaseAuth } from '../firebase';
import { fetchSignedB2Url, resolveActiveR2WorkerUrl } from '../services/r2UploadClient';
import type { PlatformConfig } from '../types';
import {
  extractYouTubeVideoId,
  getYouTubeWatchUrl,
  isYouTubeUrl,
  mapYouTubeErrorMessage,
  toYouTubeEmbedUrl,
} from '../utils/youtube';

interface YouTubePlayerProps {
  url: string;
  title?: string;
}

function shouldAttachWorkerAuth(url: string, platformConfig?: Partial<PlatformConfig> | null): boolean {
  try {
    const parsed = new URL(url);
    const activeWorker = resolveActiveR2WorkerUrl(platformConfig);
    if (activeWorker) {
      const workerParsed = new URL(activeWorker);
      if (parsed.origin === workerParsed.origin) return true;
    }
    return (
      parsed.hostname.endsWith('.workers.dev') &&
      (parsed.pathname.startsWith('/files/') || parsed.pathname.startsWith('/b2/files/'))
    );
  } catch {
    return false;
  }
}

export function AuthenticatedDirectVideo({
  url,
  platformConfig,
  className = 'aspect-video w-full',
  onFatalError,
}: {
  url: string;
  platformConfig?: Partial<PlatformConfig> | null;
  className?: string;
  onFatalError?: () => void;
}) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    let createdBlobUrl: string | null = null;
    setErrorMsg(null);

    if (!url) {
      setResolvedSrc(null);
      return;
    }

    const needsWorkerAuth = shouldAttachWorkerAuth(url, platformConfig) && Boolean(firebaseAuth.currentUser);
    if (!needsWorkerAuth) {
      setResolvedSrc(url);
      setLoading(false);
      return;
    }

    setLoading(true);
    setResolvedSrc(null);

    (async () => {
      try {
        if (url.includes('/b2/files/')) {
          try {
            const signed = await fetchSignedB2Url({
              fileUrl: url,
              platformConfig,
              download: false,
              expiresInSec: 600,
            });
            if (signed && !canceled) {
              setResolvedSrc(signed);
              return;
            }
          } catch {
            // Fallback to authenticated Worker Range/blob fetch below
          }
        }
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) {
          throw new Error('يرجى تسجيل الدخول للمعاينة.');
        }
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`تعذر تحميل الفيديو المحمي (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        createdBlobUrl = URL.createObjectURL(blob);
        if (!canceled) {
          setResolvedSrc(createdBlobUrl);
        } else {
          URL.revokeObjectURL(createdBlobUrl);
          createdBlobUrl = null;
        }
      } catch (err) {
        if (!canceled) {
          setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل معاينة الفيديو.');
          onFatalError?.();
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      canceled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [url, platformConfig, onFatalError]);

  if (loading) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-slate-900 text-xs text-slate-200">
        <Loader2 className="h-7 w-7 animate-spin text-sky-400" />
        <span>جاري تحميل معاينة الفيديو المحمي...</span>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-amber-50 p-4 text-center text-xs text-amber-900">
        <AlertTriangle className="h-7 w-7 text-amber-600" />
        <p className="font-bold">{errorMsg}</p>
      </div>
    );
  }

  if (!resolvedSrc) return null;

  return (
    <video
      src={resolvedSrc}
      controls
      playsInline
      preload="metadata"
      onError={() => onFatalError?.()}
      className={className}
    />
  );
}

export function YouTubeVideoPlayer({ url, title = 'مشغل فيديو YouTube' }: YouTubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerDomId = useId();
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const videoId = useMemo(() => extractYouTubeVideoId(url), [url]);
  const embedUrl = useMemo(() => toYouTubeEmbedUrl(url), [url]);
  const watchUrl = useMemo(() => getYouTubeWatchUrl(url), [url]);

  useEffect(() => {
    setEmbedError(null);
    setIframeLoaded(false);
  }, [url]);

  useEffect(() => {
    if (!embedUrl) return;

    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== 'https://www.youtube.com' &&
        event.origin !== 'https://www.youtube-nocookie.com'
      ) {
        return;
      }
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return;
      }
      let payload: unknown = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== 'object') return;
      const msg = payload as { event?: string; info?: unknown };
      if (msg.event === 'onError' && typeof msg.info === 'number') {
        setEmbedError(mapYouTubeErrorMessage(msg.info));
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [embedUrl]);

  function notifyIframeReady() {
    setIframeLoaded(true);
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: playerDomId }),
        '*'
      );
    } catch {
      // Cross-origin frame might block postMessage in restricted environments
    }
  }

  if (!videoId || !embedUrl) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="h-9 w-9 text-rose-600" />
        <div>
          <p className="text-sm font-bold text-rose-900">رابط YouTube غير صالح أو غير مكتمل</p>
          <p className="mt-1 text-xs text-rose-700">
            تأكد من لصق رابط صحيح مثل watch?v=... أو youtu.be/... أو shorts/...
          </p>
        </div>
        {watchUrl && (
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            فتح على YouTube (معاينة وتشخيص الإدارة)
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {embedError ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-600" />
          <div className="max-w-md space-y-1">
            <p className="text-sm font-bold text-amber-950">تعذر تشغيل الفيديو داخل المشغل المضمّن</p>
            <p className="text-xs leading-relaxed text-amber-800">{embedError}</p>
          </div>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#163A66]"
          >
            <ExternalLink className="h-4 w-4" />
            فتح على YouTube (معاينة وتشخيص الإدارة)
          </a>
        </div>
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
          {!iframeLoaded && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 text-xs text-slate-300">
              <Play className="h-8 w-8 text-sky-400" />
              <span>جاري تحميل مشغل YouTube...</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={title}
            onLoad={notifyIframeReady}
            className="relative z-10 h-full w-full border-0"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-600">
          مشغل YouTube المضمّن (16:9) • اضغط تشغيل لبدء العرض
        </span>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-bold text-[#0F294A] shadow-2xs ring-1 ring-slate-200 hover:bg-slate-100"
        >
          <ExternalLink className="h-3.5 w-3.5 text-rose-600" />
          فتح على YouTube (معاينة وتشخيص الإدارة)
        </a>
      </div>
    </div>
  );
}

export function VideoPreviewModal({
  open,
  title,
  url,
  platformConfig,
  onClose,
}: {
  open: boolean;
  title: string;
  url: string;
  platformConfig?: Partial<PlatformConfig> | null;
  onClose: () => void;
}) {
  const [directVideoError, setDirectVideoError] = useState(false);

  useEffect(() => {
    setDirectVideoError(false);
  }, [url, open]);

  if (!open) return null;

  const isYt = isYouTubeUrl(url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xs sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="truncate text-sm font-extrabold text-[#0F294A] sm:text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق مشغل الفيديو"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {isYt ? (
            <YouTubeVideoPlayer url={url} title={title} />
          ) : directVideoError ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <p className="text-sm font-bold text-amber-950">تعذر تشغيل الفيديو مباشرة داخل المتصفح</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
              >
                <ExternalLink className="h-4 w-4" />
                فتح الرابط في نافذة جديدة
              </a>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
                <AuthenticatedDirectVideo
                  url={url}
                  platformConfig={platformConfig}
                  className="h-full w-full"
                  onFatalError={() => setDirectVideoError(true)}
                />
              </div>
              <div className="flex justify-end">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#0F294A] hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  فتح الرابط الأصلي
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
