import React, { useState } from 'react';
import {
  ArchiveRestore,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { uploadAbkAsset } from '../firebase';
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

export function AssetUrlOrUploadInput({
  label,
  value,
  onChange,
  folderPath,
  imageOnly = false,
  placeholder = 'https://...',
  onToast,
}: {
  label: string;
  value: string;
  onChange: (url: string, sizeLabel?: string) => void;
  folderPath: string;
  imageOnly?: boolean;
  placeholder?: string;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadAbkAsset(file, folderPath, imageOnly);
      onChange(uploaded.url, uploaded.sizeLabel);
      onToast(`تم رفع الملف بنجاح (${uploaded.sizeLabel})`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل رفع الملف', true);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
        />
        <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{uploading ? 'جاري الرفع…' : imageOnly ? 'رفع صورة' : 'رفع ملف'}</span>
          <input
            type="file"
            accept={imageOnly ? 'image/png,image/jpeg,image/webp' : '.pdf,image/*,video/mp4,.doc,.docx,.ppt,.pptx,.zip'}
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
        </label>
      </div>
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
