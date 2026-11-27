import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import {
  checkYouTubeEmbeddability,
  extractYouTubeVideoId,
  isPermanentYouTubeErrorCode,
  isYouTubeUrl,
  mapYouTubeErrorMessage,
  type YouTubeEmbedCheckResult,
} from '../utils/youtube';

interface YouTubeEmbedStatusBannerProps {
  url: string;
  externalBlockedCode?: number | null;
  onResultChange?: (result: YouTubeEmbedCheckResult | null) => void;
}

export function YouTubeEmbedStatusBanner({
  url,
  externalBlockedCode = null,
  onResultChange,
}: YouTubeEmbedStatusBannerProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<YouTubeEmbedCheckResult | null>(null);
  const requestSeqRef = useRef(0);
  const isYt = isYouTubeUrl(url);

  const runCheck = useCallback(
    async (targetUrl: string) => {
      const seq = ++requestSeqRef.current;
      if (!isYouTubeUrl(targetUrl)) {
        setChecking(false);
        setResult(null);
        onResultChange?.(null);
        return;
      }

      setChecking(true);
      const checked = await checkYouTubeEmbeddability(targetUrl);
      if (seq !== requestSeqRef.current) return;
      setChecking(false);
      setResult(checked);
      onResultChange?.(checked);
    },
    [onResultChange]
  );

  useEffect(() => {
    if (!isYt) {
      requestSeqRef.current += 1;
      setChecking(false);
      setResult(null);
      onResultChange?.(null);
      return;
    }

    setResult(null);
    const timer = window.setTimeout(() => {
      void runCheck(url);
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [url, isYt, runCheck, onResultChange]);

  if (!isYt) {
    return null;
  }

  const videoId = extractYouTubeVideoId(url);

  if (externalBlockedCode && isPermanentYouTubeErrorCode(externalBlockedCode)) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-bold">لا يمكن اعتماد هذا الرابط للطلاب (YT_{externalBlockedCode})</p>
          <p className="leading-relaxed text-rose-800">
            {mapYouTubeErrorMessage(externalBlockedCode)}
          </p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs font-medium text-sky-900">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
        <span>جارٍ فحص سماح YouTube بالتضمين داخل تطبيق الطلاب...</span>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  if (result.status === 'embeddable') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
        <div className="flex min-w-0 items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="font-bold">{result.messageAr}</p>
            {result.title && (
              <p className="truncate text-[11px] text-emerald-700">العنوان على YouTube: {result.title}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runCheck(url)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
        >
          <RefreshCw className="h-3 w-3" />
          إعادة الفحص
        </button>
      </div>
    );
  }

  if (result.blockSave) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-bold">
              تحذير مانع للنشر: هذا الفيديو لن يعمل داخل التطبيق ({videoId || 'YouTube'})
            </p>
            <p className="leading-relaxed text-rose-800">{result.messageAr}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runCheck(url)}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
        >
          <RefreshCw className="h-3 w-3" />
          فحص التضمين الآن
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="leading-relaxed">{result.messageAr}</p>
      </div>
      <button
        type="button"
        onClick={() => void runCheck(url)}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
      >
        <RefreshCw className="h-3 w-3" />
        فحص التضمين الآن
      </button>
    </div>
  );
}
