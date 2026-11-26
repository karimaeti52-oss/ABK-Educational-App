import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  fetchWorkerHealthStatus,
  peekCachedR2QuotaStatus,
  peekCachedWorkerHealthStatus,
  resolveActiveR2WorkerUrlStatus,
  resolvePreferredStorageProvider,
  startR2ResumableUpload,
  type ActiveR2UploadController,
} from '../services/r2UploadClient';
import {
  formatBytesReadable,
  R2UploadError,
  resolveR2StorageLimits,
  type R2UploadProgress,
  type R2UploadResult,
  type WorkerHealthCheckResult,
} from '../utils/r2Upload';
import type {
  MediaAccessLevel,
  PlatformConfig,
  PublishStatus,
  R2QuotaStatus,
  StorageProviderId,
} from '../types';

export function StatusBadge({
  status,
  published,
  deletedAt,
}: {
  status?: PublishStatus;
  published?: boolean;
  deletedAt?: unknown;
}) {
  if (deletedAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
        محذوف مؤقتاً
      </span>
    );
  }
  const effective = status || (published ? 'PUBLISHED' : 'DRAFT');
  if (effective === 'PUBLISHED') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        منشور للطلاب
      </span>
    );
  }
  if (effective === 'ARCHIVED') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
        مؤرشف
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      مسودة
    </span>
  );
}

export function StatusSelector({
  value,
  onChange,
}: {
  value: PublishStatus;
  onChange: (next: PublishStatus) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">حالة النشر</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PublishStatus)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
      >
        <option value="PUBLISHED">منشور (يظهر للطلاب فوراً)</option>
        <option value="DRAFT">مسودة (مخفي للإعداد)</option>
        <option value="ARCHIVED">مؤرشف (مخفي عن الطلاب)</option>
      </select>
    </div>
  );
}

type UploadPhase = 'idle' | 'checking' | 'uploading' | 'completing' | 'paused' | 'success' | 'error' | 'canceled';

export function AssetUrlOrUploadInput({
  label,
  value,
  onChange,
  folderPath,
  imageOnly = false,
  videoOnly = false,
  accept,
  placeholder = 'https://...',
  platformConfig,
  quotaStatus,
  accessLevel,
  defaultProvider = 'b2',
  onUploadedMeta,
  onToast,
}: {
  label: string;
  value: string;
  onChange: (url: string, sizeLabel?: string) => void;
  folderPath: string;
  imageOnly?: boolean;
  videoOnly?: boolean;
  accept?: string;
  placeholder?: string;
  platformConfig?: Partial<PlatformConfig> | null;
  quotaStatus?: R2QuotaStatus | null;
  accessLevel?: MediaAccessLevel;
  defaultProvider?: StorageProviderId;
  onUploadedMeta?: (meta: R2UploadResult) => void;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [selectedProvider, setSelectedProvider] = useState<StorageProviderId>(defaultProvider);
  const [liveHealth, setLiveHealth] = useState<WorkerHealthCheckResult | null>(() =>
    peekCachedWorkerHealthStatus(platformConfig)
  );
  const [progress, setProgress] = useState<R2UploadProgress>({
    bytesTransferred: 0,
    totalBytes: 0,
    percent: 0,
    speedBytesPerSec: 0,
    currentPart: 0,
    totalParts: 1,
    phase: 'checking',
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const activeUploadRef = useRef<ActiveR2UploadController | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const isBusy = phase === 'checking' || phase === 'uploading' || phase === 'completing';
  const limits = resolveR2StorageLimits(platformConfig);
  const workerUrlStatus = resolveActiveR2WorkerUrlStatus(platformConfig);
  const workerConfigured = workerUrlStatus.valid;
  const effectiveQuota = quotaStatus ?? peekCachedR2QuotaStatus(platformConfig);

  useEffect(() => {
    let cancelled = false;
    if (!workerConfigured) {
      setLiveHealth(null);
      return;
    }
    const cached = peekCachedWorkerHealthStatus(platformConfig);
    if (cached) {
      setLiveHealth(cached);
      return;
    }
    if (effectiveQuota) return;
    void fetchWorkerHealthStatus(platformConfig)
      .then((h) => {
        if (!cancelled && h) {
          setLiveHealth(h);
          setSelectedProvider((prev) =>
            prev === defaultProvider
              ? resolvePreferredStorageProvider(effectiveQuota, h, defaultProvider)
              : prev
          );
        }
      })
      .catch(() => {
        // Defer error presentation to upload time or Settings test
      });
    return () => {
      cancelled = true;
    };
  }, [workerConfigured, workerUrlStatus.normalizedUrl, effectiveQuota, defaultProvider]);

  const b2Ready = effectiveQuota
    ? Boolean(effectiveQuota.b2?.enabled === true && effectiveQuota.b2?.verified === true)
    : liveHealth
      ? Boolean(liveHealth.b2Enabled)
      : true;
  const r2Ready = effectiveQuota
    ? Boolean(effectiveQuota.r2Bound === true)
    : liveHealth
      ? Boolean(liveHealth.r2Bound)
      : true;
  const effectiveProvider: StorageProviderId =
    selectedProvider === 'b2'
      ? b2Ready || !r2Ready
        ? 'b2'
        : 'r2'
      : r2Ready || !b2Ready
        ? 'r2'
        : 'b2';
  const providerDisplayName = effectiveProvider === 'b2' ? 'Backblaze B2' : 'Cloudflare R2';
  const resolvedAccessLevel: MediaAccessLevel =
    accessLevel ?? (folderPath.trim().toLowerCase() === 'branding' ? 'public' : 'private');
  const maxMbHint = imageOnly
    ? limits.maxImageSizeMb
    : videoOnly
      ? limits.maxVideoSizeMb
      : accept?.includes('pdf')
        ? limits.maxPdfSizeMb
        : limits.maxVideoSizeMb;

  async function runUpload(file: File) {
    lastFileRef.current = file;
    setPhase('checking');
    setProgress({
      bytesTransferred: 0,
      totalBytes: file.size,
      percent: 0,
      speedBytesPerSec: 0,
      currentPart: 0,
      totalParts: 1,
      phase: 'checking',
    });
    setStatusMessage(`جاري فحص الحد المسموح وحالة التخزين (${file.name})...`);
    setCanRetry(false);

    const controller = startR2ResumableUpload(file, folderPath, {
      platformConfig,
      quotaStatus,
      storageProvider: effectiveProvider,
      accessLevel: resolvedAccessLevel,
      imageOnly,
      videoOnly,
      onProgress: (info) => {
        setProgress(info);
        const providerLabel = effectiveProvider === 'b2' ? 'Backblaze B2' : 'Cloudflare R2';
        if (info.phase === 'uploading') {
          setPhase('uploading');
          setStatusMessage(
            info.totalParts > 1
              ? `جاري رفع ${file.name} (${providerLabel}) — جزء ${info.currentPart} من ${info.totalParts}`
              : `جاري رفع ${file.name} إلى ${providerLabel}...`
          );
        } else if (info.phase === 'completing') {
          setPhase('completing');
          setStatusMessage('جاري تثبيت الملف والتحقق من الجاهزية...');
        } else if (info.phase === 'paused') {
          setPhase('paused');
        }
      },
    });
    activeUploadRef.current = controller;

    try {
      const uploaded = await controller.promise;
      activeUploadRef.current = null;
      setPhase('success');
      setProgress((prev) => ({
        ...prev,
        bytesTransferred: uploaded.sizeBytes,
        totalBytes: uploaded.sizeBytes,
        percent: 100,
        phase: 'completing',
      }));
      const targetName = uploaded.storageProvider === 'b2' ? 'Backblaze B2' : 'Cloudflare R2';
      setStatusMessage(`تم الرفع إلى ${targetName} بنجاح (${uploaded.sizeLabel}).`);
      setCanRetry(false);
      onChange(uploaded.url, uploaded.sizeLabel);
      onUploadedMeta?.(uploaded);
      onToast(`تم رفع ${uploaded.fileName} بنجاح (${uploaded.sizeLabel})`);
    } catch (err) {
      activeUploadRef.current = null;
      const uploadErr = err instanceof R2UploadError ? err : null;
      if (uploadErr?.code === 'PAUSED') {
        setPhase('paused');
        setStatusMessage('تم إيقاف الرفع مؤقتاً. اضغط «استئناف» للمتابعة من نفس الجزء بدون فقدان التقدم.');
        setCanRetry(true);
        return;
      }
      if (uploadErr?.code === 'CANCELED') {
        setPhase('canceled');
        setStatusMessage('تم إلغاء الرفع وتنظيف الأجزاء المؤقتة.');
        setCanRetry(true);
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : `تعذر رفع الملف إلى ${providerDisplayName}. تحقق من رابط Worker والاتصال ثم أعد المحاولة.`;
      setPhase('error');
      setStatusMessage(msg);
      setCanRetry(uploadErr ? uploadErr.retryable : true);
      onToast(msg, true);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void runUpload(file);
  }

  function handlePauseUpload() {
    activeUploadRef.current?.pause();
    setPhase('paused');
    setStatusMessage('جاري إيقاف الرفع مؤقتاً بعد اكتمال الجزء الحالي...');
    setCanRetry(true);
  }

  async function handleCancelUpload() {
    await activeUploadRef.current?.cancel();
    activeUploadRef.current = null;
    setPhase('canceled');
    setStatusMessage('تم إلغاء عملية الرفع.');
    setCanRetry(Boolean(lastFileRef.current));
  }

  function handleResumeOrRetry() {
    if (!lastFileRef.current || isBusy) return;
    void runUpload(lastFileRef.current);
  }

  const resolvedAccept =
    accept ||
    (imageOnly
      ? 'image/png,image/jpeg,image/webp'
      : videoOnly
        ? 'video/mp4,video/webm,.mp4,.m4v,.webm'
        : '.pdf,image/*,video/mp4,video/webm,.doc,.docx,.ppt,.pptx,.zip');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-600">{label}</label>
        <div className="flex flex-wrap items-center gap-2">
          {workerConfigured && (
            <select
              value={effectiveProvider}
              onChange={(e) => setSelectedProvider(e.target.value as StorageProviderId)}
              disabled={isBusy}
              className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700"
              aria-label="مزود التخزين"
            >
              <option value="b2" disabled={!b2Ready}>
                {b2Ready
                  ? `Backblaze B2 (الأساسي • ${limits.b2StorageLimitGb} GB)`
                  : 'Backblaze B2 (غير مربوط في Worker)'}
              </option>
              <option value="r2" disabled={!r2Ready}>
                {r2Ready
                  ? `Cloudflare R2 (ثانوي • ${limits.r2StorageLimitGb} GB)`
                  : 'Cloudflare R2 (غير مربوط)'}
              </option>
            </select>
          )}
          <span className="text-[11px] font-medium text-slate-500">
            الحد الأقصى: {maxMbHint} MB •{' '}
            {workerUrlStatus.reason === 'EMPTY'
              ? 'بانتظار رابط Storage Worker'
              : !workerConfigured
                ? 'رابط Worker غير صالح (يجب HTTPS)'
                : effectiveQuota?.verified || liveHealth?.ok
                  ? `${effectiveProvider === 'b2' ? 'B2' : 'R2'} جاهز ومُتحقَّق منه`
                  : 'Worker مضبوط — سيُفحص الاتصال تلقائياً عند الرفع'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          dir="ltr"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (phase === 'success') setPhase('idle');
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
        />
        <label
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
            isBusy
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'cursor-pointer border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
          }`}
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>
            {phase === 'checking'
              ? `فحص ${effectiveProvider === 'b2' ? 'B2' : 'R2'}…`
              : phase === 'uploading'
                ? `جارٍ الرفع (${progress.percent}%)`
                : phase === 'completing'
                  ? 'تثبيت الملف…'
                  : imageOnly
                    ? `رفع صورة إلى ${effectiveProvider === 'b2' ? 'B2' : 'R2'}`
                    : videoOnly
                      ? `رفع فيديو إلى ${effectiveProvider === 'b2' ? 'B2' : 'R2'}`
                      : `رفع ملف إلى ${effectiveProvider === 'b2' ? 'B2' : 'R2'}`}
          </span>
          <input
            type="file"
            accept={resolvedAccept}
            className="hidden"
            onChange={handleFileChange}
            disabled={isBusy}
          />
        </label>

        {isBusy && progress.totalParts > 1 && (
          <button
            type="button"
            onClick={handlePauseUpload}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            <Pause className="h-3.5 w-3.5" />
            إيقاف مؤقت
          </button>
        )}

        {isBusy && (
          <button
            type="button"
            onClick={() => void handleCancelUpload()}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            <X className="h-3.5 w-3.5" />
            إلغاء
          </button>
        )}
      </div>

      {/* Live progress bar with speed & chunk tracking */}
      {isBusy && (
        <div className="space-y-1.5 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-sky-900">
            <span className="truncate">{statusMessage}</span>
            <span dir="ltr">
              {progress.percent}% ({formatBytesReadable(progress.bytesTransferred)} /{' '}
              {formatBytesReadable(progress.totalBytes || 1)})
              {progress.speedBytesPerSec > 0 ? ` • ${formatBytesReadable(progress.speedBytesPerSec)}/s` : ''}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full bg-sky-600 transition-all duration-200"
              style={{ width: `${Math.max(phase === 'checking' ? 8 : 3, progress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload succeeded */}
      {phase === 'success' && statusMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Paused / Failed / Canceled */}
      {(phase === 'paused' || phase === 'error' || phase === 'canceled') && statusMessage && (
        <div
          className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between ${
            phase === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-relaxed">{statusMessage}</span>
          </div>
          {canRetry && lastFileRef.current && (
            <button
              type="button"
              onClick={handleResumeOrRetry}
              className="inline-flex shrink-0 items-center gap-1 self-end rounded-lg bg-white px-3 py-1.5 font-bold text-[#0F294A] shadow-2xs ring-1 ring-slate-200 hover:bg-slate-50 sm:self-center"
            >
              {phase === 'paused' ? <Play className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {phase === 'paused' ? 'استئناف الرفع' : 'إعادة المحاولة / استئناف'}
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {workerConfigured
          ? `يدعم الرفع المجزأ القابل للاستئناف مباشرة إلى ${providerDisplayName} (فيديو حتى ${limits.maxVideoSizeMb} MB، PDF حتى ${limits.maxPdfSizeMb} MB، صور حتى ${limits.maxImageSizeMb} MB) أو لصق رابط HTTPS مباشر.`
          : 'يمكنك لصق رابط HTTPS مباشر الآن، أو إضافة رابط Storage Worker في «إعدادات المنصة» لتفعيل الرفع المباشر إلى Backblaze B2 للملفات والفيديو.'}
      </p>

      {imageOnly && value && (
        <img
          src={value}
          alt={label}
          className="mt-1 h-16 w-28 rounded-lg border border-slate-200 object-cover"
        />
      )}
    </div>
  );
}

export function RowActionButtons({
  published,
  deletedAt,
  canEdit,
  canHardDelete,
  onTogglePublish,
  onEdit,
  onSoftDelete,
  onRestore,
  onHardDelete,
}: {
  published: boolean;
  deletedAt?: unknown;
  canEdit: boolean;
  canHardDelete: boolean;
  onTogglePublish?: () => void;
  onEdit?: () => void;
  onSoftDelete?: () => void;
  onRestore?: () => void;
  onHardDelete?: () => void;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {deletedAt ? (
        <>
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              title="استعادة"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              استعادة
            </button>
          )}
          {canHardDelete && onHardDelete && (
            <button
              type="button"
              onClick={onHardDelete}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              title="حذف نهائي"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف نهائي
            </button>
          )}
        </>
      ) : (
        <>
          {onTogglePublish && (
            <button
              type="button"
              onClick={onTogglePublish}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
              title={published ? 'إخفاء (مسودة)' : 'نشر للطلاب'}
            >
              {published ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-amber-600" />}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              تعديل
            </button>
          )}
          {onSoftDelete && (
            <button
              type="button"
              onClick={onSoftDelete}
              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
              title="نقل إلى المحذوفات (أرشفة)"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  showDeleted,
  onToggleDeleted,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  showDeleted?: boolean;
  onToggleDeleted?: () => void;
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
      <div>
        <h2 className="text-xl font-bold text-[#0F294A]">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onToggleDeleted && (
          <button
            type="button"
            onClick={onToggleDeleted}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              showDeleted
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {showDeleted ? 'إخفاء المحذوفات' : 'عرض سلة المحذوفات'}
          </button>
        )}
        {action}
      </div>
    </div>
  );
}

export function EmptyBox({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-base font-bold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
