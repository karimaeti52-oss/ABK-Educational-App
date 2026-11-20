import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AbkUploadError,
  formatFileSizeLabel,
  startAbkAssetUpload,
  type ActiveUploadHandle,
  type UploadProgressInfo,
} from '../firebase';
import type { PublishStatus } from '../types';

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

type UploadPhase = 'idle' | 'checking' | 'uploading' | 'success' | 'error' | 'canceled';

export function AssetUrlOrUploadInput({
  label,
  value,
  onChange,
  folderPath,
  imageOnly = false,
  accept,
  placeholder = 'https://...',
  onToast,
}: {
  label: string;
  value: string;
  onChange: (url: string, sizeLabel?: string) => void;
  folderPath: string;
  imageOnly?: boolean;
  accept?: string;
  placeholder?: string;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState<UploadProgressInfo>({
    bytesTransferred: 0,
    totalBytes: 0,
    percent: 0,
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const activeUploadRef = useRef<ActiveUploadHandle | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const isBusy = phase === 'checking' || phase === 'uploading';

  async function runUpload(file: File) {
    lastFileRef.current = file;
    setPhase('checking');
    setProgress({ bytesTransferred: 0, totalBytes: file.size, percent: 0 });
    setStatusMessage('جاري التحقق من جاهزية خدمة التخزين...');
    setCanRetry(false);

    const handle = startAbkAssetUpload(file, folderPath, {
      imageOnly,
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
        if (nextPhase === 'uploading') {
          setStatusMessage(`جاري رفع ${file.name}...`);
        }
      },
      onProgress: (info) => {
        setProgress(info);
      },
    });
    activeUploadRef.current = handle;

    try {
      const uploaded = await handle.promise;
      activeUploadRef.current = null;
      setPhase('success');
      setProgress({ bytesTransferred: file.size, totalBytes: file.size, percent: 100 });
      setStatusMessage(`تم الرفع بنجاح (${uploaded.sizeLabel}) وتم توليد رابط التنزيل.`);
      setCanRetry(false);
      onChange(uploaded.url, uploaded.sizeLabel);
      onToast(`تم رفع الملف بنجاح (${uploaded.sizeLabel})`);
    } catch (err) {
      activeUploadRef.current = null;
      const uploadErr = err instanceof AbkUploadError ? err : null;
      if (uploadErr?.code === 'CANCELED') {
        setPhase('canceled');
        setStatusMessage('تم إلغاء الرفع. يمكنك اختيار ملف آخر أو لصق رابط مباشر.');
        setCanRetry(true);
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'تعذر رفع الملف. يمكنك لصق رابط HTTPS مباشر مجاناً.';
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

  function handleCancelUpload() {
    activeUploadRef.current?.cancel();
    activeUploadRef.current = null;
    setPhase('canceled');
    setStatusMessage('تم إلغاء عملية الرفع.');
    setCanRetry(Boolean(lastFileRef.current));
  }

  function handleRetryUpload() {
    if (!lastFileRef.current || isBusy) return;
    void runUpload(lastFileRef.current);
  }

  const resolvedAccept =
    accept ||
    (imageOnly
      ? 'image/png,image/jpeg,image/webp'
      : '.pdf,image/*,video/mp4,video/webm,.doc,.docx,.ppt,.pptx,.zip');

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600">{label}</label>
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
              ? 'فحص التخزين…'
              : phase === 'uploading'
                ? `جارٍ الرفع (${progress.percent}%)`
                : imageOnly
                  ? 'رفع صورة'
                  : 'رفع ملف'}
          </span>
          <input
            type="file"
            accept={resolvedAccept}
            className="hidden"
            onChange={handleFileChange}
            disabled={isBusy}
          />
        </label>

        {isBusy && (
          <button
            type="button"
            onClick={handleCancelUpload}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            <X className="h-3.5 w-3.5" />
            إلغاء الرفع
          </button>
        )}
      </div>

      {/* Live progress bar */}
      {isBusy && (
        <div className="space-y-1.5 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-sky-900">
            <span className="truncate">{statusMessage}</span>
            <span dir="ltr">
              {progress.percent}% ({formatFileSizeLabel(progress.bytesTransferred)} /{' '}
              {formatFileSizeLabel(progress.totalBytes || 1)})
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full bg-sky-600 transition-all duration-200"
              style={{ width: `${Math.max(phase === 'checking' ? 8 : 2, progress.percent)}%` }}
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

      {/* Upload failed or canceled */}
      {(phase === 'error' || phase === 'canceled') && statusMessage && (
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
              onClick={handleRetryUpload}
              className="inline-flex shrink-0 items-center gap-1 self-end rounded-lg bg-white px-3 py-1.5 font-bold text-[#0F294A] shadow-2xs ring-1 ring-slate-200 hover:bg-slate-50 sm:self-center"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة المحاولة
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        مجاني 100%: الصق رابط HTTPS مباشر (Google Drive / Cloudflare R2 / YouTube / GitHub)، أو ارفع مباشرة عند توفر Firebase Storage.
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
