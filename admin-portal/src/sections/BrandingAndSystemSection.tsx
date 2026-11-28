import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Info,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Upload,
} from 'lucide-react';
import {
  ApiError,
  exportFullBackupViaBackend,
  restoreBackupViaBackend,
} from '../api';
import {
  AssetUrlOrUploadInput,
  EmptyBox,
  RowActionButtons,
  SectionHeader,
  StatusBadge,
  StatusSelector,
} from '../components/CommonUi';
import {
  DEFAULT_ANDROID_RELEASE,
  DEFAULT_PLATFORM_CONFIG,
  exportClientSnapshotJson,
  hardDeleteEntity,
  normalizeStatusFlags,
  restoreEntity,
  saveAndroidRelease,
  savePlatformConfig,
  softDeleteEntity,
  subscribeAndroidRelease,
  updateEntityStatus,
  upsertEntity,
  type CmsStore,
} from '../services/firestoreCms';
import type {
  AndroidReleaseManifest,
  Announcement,
  AnnouncementCategory,
  BottomNavConfigItem,
  PlatformConfig,
  PublishStatus,
  StaffSession,
} from '../types';
import {
  buildMultiProviderStorageSummary,
  formatBytesReadable,
  PERMANENT_MIDAD_APK_URL,
  resolveR2StorageLimits,
  validateR2WorkerBaseUrlInput,
} from '../utils/r2Upload';
import {
  clearCachedR2QuotaStatus,
  fetchR2QuotaStatus,
  peekCachedR2QuotaStatus,
} from '../services/r2UploadClient';
import {
  extractBrandingPlatformUpdates,
  extractGeneralToggleUpdates,
  formatPlatformSettingsSaveError,
} from '../utils/platformConfig';

export function BrandingSection({
  store,
  staff,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [draft, setDraft] = useState<PlatformConfig>(store.platformConfig);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setDraft(store.platformConfig);
    }
  }, [store.platformConfig, isDirty]);

  const updateDraft = (updater: PlatformConfig) => {
    setIsDirty(true);
    setDraft(updater);
  };

  const navItems: BottomNavConfigItem[] =
    draft.bottomNavItems?.length
      ? draft.bottomNavItems
      : DEFAULT_PLATFORM_CONFIG.bottomNavItems!;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await savePlatformConfig(
        extractBrandingPlatformUpdates({ ...draft, bottomNavItems: navItems }),
        staff,
        { scope: 'branding' }
      );
      setIsDirty(false);
      onToast('تم حفظ وتطبيق هوية وتصميم المنصة مباشرة على تطبيق Android');
    } catch (err) {
      onToast(formatPlatformSettingsSaveError(err, staff), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="إعدادات الهوية والتصميم داخل التطبيق"
        subtitle="تُحدّث هذه الإعدادات واجهة الطلاب داخل التطبيق فورياً (الشعار، الألوان، عنوان ماذا تدرس؟، الشريط السفلي، والصور)."
      />

      <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-xs text-sky-900">
        <Info className="h-4 w-4 shrink-0 text-sky-600" />
        <p>
          ملاحظة تقنية: الاسم والشعار والألوان هنا تُحدّث الشاشة الرئيسية وداخل التطبيق فوراً بدون إعادة بناء APK. أما
          أيقونة التطبيق على شاشة الهاتف (Launcher Icon) واسم حزمة النظام فهما مدمجان داخل ملف APK.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <form onSubmit={handleSave} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اسم المنصة داخل التطبيق *</label>
              <input
                required
                value={draft.platformName}
                onChange={(e) => updateDraft({ ...draft, platformName: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الوصف الفرعي للشعار</label>
              <input
                value={draft.platformTagline}
                onChange={(e) => updateDraft({ ...draft, platformTagline: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان القسم الرئيسي (مثال: ماذا تدرس؟) *</label>
              <input
                required
                value={draft.homeHeadline}
                onChange={(e) => updateDraft({ ...draft, homeHeadline: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان بطاقة الترحيب</label>
              <input
                value={draft.welcomeTitle}
                onChange={(e) => updateDraft({ ...draft, welcomeTitle: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">النص الترحيبي</label>
              <input
                value={draft.welcomeSubtitle}
                onChange={(e) => updateDraft({ ...draft, welcomeSubtitle: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اللون الرئيسي</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.primaryColorHex}
                  onChange={(e) => updateDraft({ ...draft, primaryColorHex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                />
                <input
                  dir="ltr"
                  value={draft.primaryColorHex}
                  onChange={(e) => updateDraft({ ...draft, primaryColorHex: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-left text-xs"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اللون الثانوي</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.secondaryColorHex}
                  onChange={(e) => updateDraft({ ...draft, secondaryColorHex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                />
                <input
                  dir="ltr"
                  value={draft.secondaryColorHex}
                  onChange={(e) => updateDraft({ ...draft, secondaryColorHex: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-left text-xs"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">لون التمييز</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.accentColorHex || '#C7A15A'}
                  onChange={(e) => updateDraft({ ...draft, accentColorHex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                />
                <input
                  dir="ltr"
                  value={draft.accentColorHex || '#C7A15A'}
                  onChange={(e) => updateDraft({ ...draft, accentColorHex: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-left text-xs"
                />
              </div>
            </div>
          </div>

          <AssetUrlOrUploadInput
            label="شعار المنصة (Logo)"
            value={draft.logoUrl || ''}
            onChange={(url) => updateDraft({ ...draft, logoUrl: url })}
            folderPath="branding"
            accessLevel="public"
            imageOnly
            platformConfig={store.platformConfig}
            onToast={onToast}
          />
          <AssetUrlOrUploadInput
            label="صورة بانر الترحيب (Hero Banner)"
            value={draft.heroBannerUrl || ''}
            onChange={(url) => updateDraft({ ...draft, heroBannerUrl: url })}
            folderPath="branding"
            accessLevel="public"
            imageOnly
            platformConfig={store.platformConfig}
            onToast={onToast}
          />

          <div>
            <h4 className="mb-2 text-xs font-bold text-[#0F294A]">تخصيص الشريط السفلي للتطبيق</h4>
            <div className="space-y-2">
              {navItems.map((item, idx) => (
                <div key={item.route} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                  <span className="w-20 font-mono text-slate-500">{item.route}</span>
                  <input
                    value={item.label}
                    onChange={(e) => {
                      const next = [...navItems];
                      next[idx] = { ...next[idx], label: e.target.value };
                      updateDraft({ ...draft, bottomNavItems: next });
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                  />
                  <label className="inline-flex items-center gap-1.5 font-semibold">
                    <input
                      type="checkbox"
                      checked={item.visible}
                      onChange={(e) => {
                        const next = [...navItems];
                        next[idx] = { ...next[idx], visible: e.target.checked };
                        updateDraft({ ...draft, bottomNavItems: next });
                      }}
                    />
                    إظهار
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F294A] px-6 py-2.5 text-xs font-bold text-white"
            >
              <Save className="h-4 w-4" />
              {saving ? 'جاري النشر...' : 'حفظ ونشر التصميم للتطبيق'}
            </button>
          </div>
        </form>

        {/* Live Mobile App Preview */}
        <div className="xl:col-span-4">
          <div className="sticky top-20 rounded-3xl border-4 border-slate-800 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {draft.logoUrl ? (
                  <img src={draft.logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{ backgroundColor: draft.primaryColorHex }}
                  >
                    مداد
                  </div>
                )}
                <div>
                  <p className="text-xs font-extrabold" style={{ color: draft.primaryColorHex }}>
                    {draft.platformName}
                  </p>
                  <p className="text-[10px]" style={{ color: draft.secondaryColorHex }}>
                    {draft.platformTagline}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">معاينة حية</span>
            </div>

            <div
              className="mb-4 rounded-2xl p-4 text-white"
              style={{
                background: `linear-gradient(135deg, ${draft.primaryColorHex}, ${draft.secondaryColorHex})`,
              }}
            >
              <p className="text-sm font-bold">{draft.welcomeTitle}</p>
              <p className="mt-1 text-[11px] opacity-90">{draft.welcomeSubtitle}</p>
            </div>

            <p className="mb-2 text-sm font-extrabold" style={{ color: draft.primaryColorHex }}>
              {draft.homeHeadline}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {['الثالث الثانوي', 'الحادي عشر', 'التاسع الأساسي', 'دورات التأسيس'].map((sample) => (
                <div key={sample} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-700">
                  {sample}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-around border-t border-slate-200 pt-2 text-[10px] font-bold text-slate-500">
              {navItems
                .filter((i) => i.visible)
                .map((i, idx) => (
                  <span key={i.route} style={idx === 0 ? { color: draft.secondaryColorHex } : undefined}>
                    {i.label}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnnouncementsSection({
  store,
  staff,
  canEdit,
  canHardDelete,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  canEdit: boolean;
  canHardDelete: boolean;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('GENERAL');
  const [subjectId, setSubjectId] = useState('');
  const [pinned, setPinned] = useState(true);
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const items = store.announcements.filter((a) => (showDeleted ? true : !a.deletedAt));

  function startCreate() {
    setEditing(null);
    setTitle('');
    setBody('');
    setCategory('NEW_LESSON');
    setSubjectId('');
    setPinned(true);
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(a: Announcement) {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setCategory(a.category);
    setSubjectId(a.subjectId || '');
    setPinned(a.pinned);
    setStatus(a.status || (a.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    try {
      await upsertEntity(
        'announcements',
        editing?.id,
        {
          title: title.trim(),
          body: body.trim(),
          category,
          subjectId: subjectId || undefined,
          pinned,
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      setOpenForm(false);
      onToast('تم نشر التنبيه بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  return (
    <div>
      <SectionHeader
        title="إدارة التنبيهات والإعلانات"
        subtitle="أرسل تنبيهات فورية ومجانية تظهر داخل التطبيق للطلاب."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button type="button" onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white">
              <Plus className="h-4 w-4" />
              إرسال تنبيه جديد
            </button>
          )
        }
      />

      {openForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان الإعلان *</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">التصنيف</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="NEW_LESSON">درس جديد</option>
                <option value="NEW_MATERIAL">ملف جديد</option>
                <option value="GENERAL">إعلان عام</option>
                <option value="URGENT">تنبيه هام</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">النص *</label>
              <textarea required rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <StatusSelector value={status} onChange={setStatus} />
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="pin_ann" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <label htmlFor="pin_ann" className="text-sm font-semibold text-slate-700">تثبيت في الصفحة الرئيسية</label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs">إلغاء</button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">حفظ الإعلان</button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyBox title="لا توجد إعلانات" subtitle="أضف تنبيهاً للطلاب ليظهر في الشريط العلوي وشاشة الإشعارات." />
      ) : (
        <div className="space-y-2.5">
          {items.map((a) => (
            <div key={a.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#0F294A]">{a.title}</span>
                  <StatusBadge status={a.status} published={a.published} deletedAt={a.deletedAt} />
                  {a.pinned && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">مثبت</span>}
                </div>
                <p className="mt-1 text-xs text-slate-600">{a.body}</p>
              </div>
              <RowActionButtons
                published={a.published}
                deletedAt={a.deletedAt}
                canEdit={canEdit}
                canHardDelete={canHardDelete}
                onTogglePublish={() => updateEntityStatus('announcements', a.id, a.published ? 'DRAFT' : 'PUBLISHED', staff, a.title)}
                onEdit={() => startEdit(a)}
                onSoftDelete={() => softDeleteEntity('announcements', a.id, staff, a.title)}
                onRestore={() => restoreEntity('announcements', a.id, staff, a.title)}
                onHardDelete={() => hardDeleteEntity('announcements', a.id, staff, a.title)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuditLogsSection({ store }: { store: CmsStore }) {
  const [filter, setFilter] = useState('');
  const logs = store.auditLogs.filter((l) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.actorEmail || '').toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.entityType.toLowerCase().includes(q) ||
      (l.summary || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="سجل العمليات الإدارية (Audit Log)"
        subtitle="سجل غير قابل للتعديل أو الحذف يوثق جميع تغييرات المشرفين والمحتوى والصلاحيات."
      />
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="تصفية حسب المشرف أو نوع العملية..."
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
      />
      {logs.length === 0 ? (
        <EmptyBox title="لا توجد سجلات مطابقة" subtitle="يتم تسجيل كل عملية إدارية تلقائياً هنا." />
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 text-xs sm:flex-row sm:items-center">
              <div>
                <p className="font-bold text-[#0F294A]">{l.summary || l.action}</p>
                <p className="text-slate-500">
                  {l.actorEmail || l.actorUid} ({l.actorRole || 'STAFF'}) • {l.entityType} {l.entityId ? `#${l.entityId}` : ''}
                </p>
              </div>
              <span className="self-start rounded-lg bg-slate-100 px-2.5 py-1 font-mono font-bold text-slate-700 sm:self-center">
                {l.action}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BackupsSection({
  store,
  staff,
  onRequireReauth,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  onRequireReauth: () => void;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const payload = staff.backendOnline
        ? await exportFullBackupViaBackend()
        : await exportClientSnapshotJson();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `midad-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onToast('تم تصدير النسخة الاحتياطية الكاملة بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل التصدير', true);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!staff.backendOnline) {
      onToast('الاستعادة الجماعية تتطلب تشغيل الخادم الخلفي الموثوق (server/index.js).', true);
      e.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await restoreBackupViaBackend(json);
      onToast(`تمت استعادة ${res.restoredCount} سجل من النسخة الاحتياطية`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 428) {
        onRequireReauth();
      }
      onToast(err instanceof Error ? err.message : 'ملف النسخة الاحتياطية غير صالح', true);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="النسخ الاحتياطي والاستعادة (Super Admin)"
        subtitle="تصدير نسخة JSON كاملة لبيانات المنصة واستعادتها بشكل آمن وموثق."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-[#0F294A]">تصدير نسخة احتياطية كاملة</h3>
          <p className="mt-1 text-xs text-slate-500">
            يشمل المراحل، المواد، الوحدات، الأساتذة، الدروس، الشروحات، الاختبارات، والتصميم.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleExport}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0F294A] px-5 py-2.5 text-xs font-bold text-white"
          >
            <Download className="h-4 w-4" />
            تنزيل ملف JSON الاحتياطي
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-[#0F294A]">استعادة من نسخة احتياطية</h3>
          <p className="mt-1 text-xs text-slate-500">
            عملية حساسة مقتصرة على المدير العام وتتطلب جلسة موثقة حديثاً وخادماً خلفياً متصلاً.
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100">
            <RotateCcw className="h-4 w-4" />
            <Upload className="h-4 w-4" />
            اختيار ملف JSON للاستعادة
            <input type="file" accept="application/json" className="hidden" onChange={handleRestoreFile} disabled={busy} />
          </label>
        </div>
      </div>

      {store.backups.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-sm font-bold text-[#0F294A]">سجل النسخ السابقة</h4>
          <div className="space-y-2">
            {store.backups.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                <span className="font-bold text-slate-700">{b.label}</span>
                <span className="text-slate-500">{b.createdByEmail || b.createdByUid}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlatformSettingsSection({
  store,
  staff,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [cfg, setCfg] = useState<PlatformConfig>(store.platformConfig);
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [release, setRelease] = useState<AndroidReleaseManifest>(DEFAULT_ANDROID_RELEASE);
  const [publishingRelease, setPublishingRelease] = useState(false);
  const [savingToggles, setSavingToggles] = useState(false);
  const [testingR2, setTestingR2] = useState(false);
  const [r2HealthMsg, setR2HealthMsg] = useState<string | null>(null);
  const [r2HealthError, setR2HealthError] = useState(false);
  const [liveQuota, setLiveQuota] = useState(() => peekCachedR2QuotaStatus(store.platformConfig));

  useEffect(() => {
    setCfg(store.platformConfig);
  }, [store.platformConfig]);

  useEffect(() => {
    const unsub = subscribeAndroidRelease((manifest) => {
      setRelease(manifest);
    });
    return () => unsub();
  }, []);

  const isSuperAdmin = staff.role === 'SUPER_ADMIN';
  const b2LiveVerified = Boolean(liveQuota?.b2?.workerConfigured && liveQuota?.b2?.verified);
  const effectiveB2Enabled =
    b2LiveVerified && (liveQuota?.b2?.enabled === true || Boolean(cfg.b2Enabled));
  const currentLimits = resolveR2StorageLimits({ ...cfg, b2Enabled: effectiveB2Enabled });
  const providerSummary = buildMultiProviderStorageSummary({
    limits: currentLimits,
    r2Quota: liveQuota,
  });

  async function saveToggles() {
    if (!isSuperAdmin) {
      setSavingToggles(true);
      try {
        await savePlatformConfig(extractGeneralToggleUpdates(cfg), staff, { scope: 'general' });
        onToast('تم حفظ الإعدادات العامة بنجاح (تعديل إعدادات التخزين مقتصر على المدير العام SUPER_ADMIN).');
      } catch (err) {
        onToast(formatPlatformSettingsSaveError(err, staff), true);
      } finally {
        setSavingToggles(false);
      }
      return;
    }

    const rawWorkerInput = cfg.r2WorkerBaseUrl || '';
    const urlCheck = validateR2WorkerBaseUrlInput(rawWorkerInput);
    if (rawWorkerInput.trim() && !urlCheck.valid) {
      onToast(urlCheck.errorMessage || 'رابط Storage Worker غير صالح.', true);
      return;
    }

    const nextR2 = Math.max(1, Math.round(Number(cfg.r2StorageLimitGb ?? 10)));
    const nextB2 = Math.max(0, Math.round(Number(cfg.b2StorageLimitGb ?? 10)));
    const safeB2Enabled = b2LiveVerified && (liveQuota?.b2?.enabled === true || cfg.b2Enabled === true);
    const limits = resolveR2StorageLimits({
      ...cfg,
      r2StorageLimitGb: nextR2,
      b2StorageLimitGb: nextB2,
      b2Enabled: safeB2Enabled,
    });

    setSavingToggles(true);
    try {
      await savePlatformConfig(
        {
          ...DEFAULT_PLATFORM_CONFIG,
          ...store.platformConfig,
          ...cfg,
          r2WorkerBaseUrl: urlCheck.valid ? urlCheck.normalizedUrl : '',
          maxVideoSizeMb: limits.maxVideoSizeMb,
          maxPdfSizeMb: limits.maxPdfSizeMb,
          maxImageSizeMb: limits.maxImageSizeMb,
          r2StorageLimitGb: limits.r2StorageLimitGb,
          b2StorageLimitGb: limits.b2StorageLimitGb,
          b2Enabled: safeB2Enabled,
          primaryStorageProvider: safeB2Enabled ? 'b2' : 'r2',
          totalStorageLimitGb: limits.totalStorageLimitGb,
        },
        staff,
        { scope: 'full' }
      );
      clearCachedR2QuotaStatus();
      onToast(
        safeB2Enabled
          ? `تم حفظ الإعدادات: Backblaze B2 الأساسي (${limits.b2StorageLimitGb} GB)${liveQuota?.r2Bound ? ` + R2 (${limits.r2StorageLimitGb} GB)` : ''}`
          : `تم حفظ الإعدادات: السعة الفعالة حالياً ${limits.r2StorageLimitGb} GB (R2) • بانتظار أسرار Backblaze B2`
      );
    } catch (err) {
      onToast(formatPlatformSettingsSaveError(err, staff), true);
    } finally {
      setSavingToggles(false);
    }
  }

  async function handleTestR2Connection() {
    setTestingR2(true);
    setR2HealthMsg(null);
    setR2HealthError(false);
    try {
      const q = await fetchR2QuotaStatus(cfg);
      setLiveQuota(q);
      if (!q) {
        setR2HealthError(true);
        setR2HealthMsg('بانتظار إدخال رابط Storage Worker يبدأ بـ https:// لإجراء التحقق الفعلي.');
      } else if (!q.verified) {
        setR2HealthError(true);
        setR2HealthMsg(
          'تحذير: تم الوصول إلى Storage Worker لكن لم يتم التحقق من Backblaze B2 أو Cloudflare R2 بعد.'
        );
      } else {
        const b2Ready = Boolean(q.b2?.enabled && q.b2?.verified);
        const b2VerifiedOnly = Boolean(q.b2?.workerConfigured && q.b2?.verified && !q.b2?.enabled);
        const b2Used = formatBytesReadable(q.b2?.usedBytes ?? 0);
        const b2Limit = formatBytesReadable(q.b2?.allocatedLimitBytes ?? 0);
        const b2Summary = b2Ready
          ? `Backblaze B2 (الأساسي): مفعّل ومتحقق (${b2Used} / ${b2Limit} • ${q.b2?.fileCount ?? 0} ملف)`
          : b2VerifiedOnly
            ? `Backblaze B2: متصل ومختبَر (${b2Used} / ${b2Limit})`
            : `Backblaze B2: غير مفعّل (${q.b2?.error ? `فشل الفحص: ${q.b2.error}` : 'بانتظار إضافة أسرار B2 في Cloudflare Worker'})`;

        const r2Used = formatBytesReadable(q.r2?.usedBytes ?? q.usedBytes);
        const r2Limit = formatBytesReadable(q.r2?.allocatedLimitBytes ?? q.totalLimitBytes);
        const r2Files = q.r2?.fileCount ?? q.fileCount;
        const r2Summary =
          q.r2Bound && q.r2?.verified
            ? `Cloudflare R2 (ثانوي): متحقق (${r2Used} / ${r2Limit} • ${r2Files} ملف)`
            : 'Cloudflare R2: غير مربوط (التخزين يعمل بالكامل عبر Backblaze B2)';

        setR2HealthMsg(`${b2Summary} | ${r2Summary}`);
      }
    } catch (err) {
      setLiveQuota(null);
      setR2HealthError(true);
      setR2HealthMsg(err instanceof Error ? err.message : 'تعذر التحقق الفعلي من خادم التخزين Worker');
    } finally {
      setTestingR2(false);
    }
  }

  async function handlePublishAndroidRelease(e: React.FormEvent) {
    e.preventDefault();
    setPublishingRelease(true);
    try {
      await saveAndroidRelease(release, staff);
      onToast(`تم نشر بيانات تحديث تطبيق مداد v${release.versionName} (${release.versionCode}) بنجاح`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل نشر تحديث التطبيق', true);
    } finally {
      setPublishingRelease(false);
    }
  }

  async function addCustomSectionType(e: React.FormEvent) {
    e.preventDefault();
    const cleanKey = customKey.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!cleanKey || !customLabel.trim()) return;
    await upsertEntity(
      'customSectionTypes',
      cleanKey,
      {
        key: cleanKey,
        labelAr: customLabel.trim(),
        description: customDesc.trim(),
        iconKey: 'custom',
        published: true,
      },
      staff,
      customLabel.trim()
    );
    setCustomKey('');
    setCustomLabel('');
    setCustomDesc('');
    onToast('تمت إضافة نوع القسم المخصص');
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="إعدادات المنصة العامة وتحديثات تطبيق Android"
        subtitle="التحكم في خصائص تطبيق الطلاب، نشر التحديثات داخل التطبيق بأمان، وتعريف أقسام محتوى مخصصة."
      />

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
          <span className="font-semibold text-slate-800">السماح بحفظ ملفات PDF للقراءة أوفلاين</span>
          <input
            type="checkbox"
            checked={cfg.allowOfflinePdf !== false}
            onChange={(e) => setCfg({ ...cfg, allowOfflinePdf: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
          <span className="font-semibold text-slate-800">إظهار شريط الإعلانات والتنبيهات في الرئيسية</span>
          <input
            type="checkbox"
            checked={cfg.showAnnouncements !== false}
            onChange={(e) => setCfg({ ...cfg, showAnnouncements: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
          <span className="font-semibold text-slate-800">إظهار بطاقة "متابعة المشاهدة"</span>
          <input
            type="checkbox"
            checked={cfg.showContinueWatching !== false}
            onChange={(e) => setCfg({ ...cfg, showContinueWatching: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="font-bold text-amber-900">تفعيل وضع الصيانة المؤقت</span>
          <input
            type="checkbox"
            checked={cfg.maintenanceMode === true}
            onChange={(e) => setCfg({ ...cfg, maintenanceMode: e.target.checked })}
          />
        </label>

        {/* Multi-Provider Storage (20 GB target: 10 GB R2 + 10 GB B2 disabled until linked) */}
        <div className="mt-4 space-y-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-[#142A43]">
                تخزين الوسائط السحابي (السعة المستهدفة 20 GB: 10 GB لـ Cloudflare R2 + 10 GB لـ Backblaze B2)
              </h4>
              <p className="text-xs text-slate-500">
                لا تُحتسب أي مساحة أو حصة مجانية على أنها مفعّلة إلا بعد التحقق الفعلي من حساب الخدمة وربطه. تُحفظ مفاتيح B2 السرية في Cloudflare Worker Secrets فقط ولا تُخزّن في Firestore.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleTestR2Connection()}
              disabled={testingR2}
              className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
            >
              {testingR2 ? 'جاري التحقق الفعلي...' : 'التحقق الفعلي من Worker و R2 / B2'}
            </button>
          </div>

          {!isSuperAdmin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              تعديل إعدادات التخزين (Backblaze B2 / Cloudflare R2) مقتصر على المدير العام النشط (SUPER_ADMIN) فقط.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">رابط Storage Worker (Backblaze B2 / R2 — HTTPS) *</label>
            <input
              type="url"
              dir="ltr"
              disabled={!isSuperAdmin}
              value={cfg.r2WorkerBaseUrl || ''}
              onChange={(e) => {
                setCfg({ ...cfg, r2WorkerBaseUrl: e.target.value });
                setLiveQuota(null);
              }}
              placeholder="https://midad-r2-worker.your-subdomain.workers.dev"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الحد الأقصى للفيديو (MB)</label>
              <input
                type="number"
                min={1}
                max={2048}
                dir="ltr"
                disabled={!isSuperAdmin}
                value={cfg.maxVideoSizeMb ?? 200}
                onChange={(e) => setCfg({ ...cfg, maxVideoSizeMb: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الحد الأقصى لـ PDF (MB)</label>
              <input
                type="number"
                min={1}
                max={1024}
                dir="ltr"
                disabled={!isSuperAdmin}
                value={cfg.maxPdfSizeMb ?? 100}
                onChange={(e) => setCfg({ ...cfg, maxPdfSizeMb: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الحد الأقصى للصور (MB)</label>
              <input
                type="number"
                min={1}
                max={256}
                dir="ltr"
                disabled={!isSuperAdmin}
                value={cfg.maxImageSizeMb ?? 20}
                onChange={(e) => setCfg({ ...cfg, maxImageSizeMb: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">حصة Backblaze B2 الأساسية (GB)</label>
              <input
                type="number"
                min={0}
                max={500}
                dir="ltr"
                disabled={!isSuperAdmin}
                value={cfg.b2StorageLimitGb ?? 10}
                onChange={(e) => {
                  const nextB2 = Math.max(0, Number(e.target.value) || 0);
                  const currentR2 = cfg.r2StorageLimitGb ?? 10;
                  setCfg({
                    ...cfg,
                    b2StorageLimitGb: nextB2,
                    totalStorageLimitGb: effectiveB2Enabled ? currentR2 + nextB2 : currentR2,
                  });
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">حصة Cloudflare R2 الثانوية (GB)</label>
              <input
                type="number"
                min={1}
                max={500}
                dir="ltr"
                disabled={!isSuperAdmin}
                value={cfg.r2StorageLimitGb ?? 10}
                onChange={(e) => {
                  const nextR2 = Math.max(1, Number(e.target.value) || 10);
                  setCfg({
                    ...cfg,
                    r2StorageLimitGb: nextR2,
                    totalStorageLimitGb: effectiveB2Enabled ? nextR2 + (cfg.b2StorageLimitGb ?? 10) : nextR2,
                  });
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                الهدف الإجمالي (الفعّال حالياً: {formatBytesReadable(providerSummary.verifiedActiveTotalBytes)})
              </label>
              <input
                type="number"
                readOnly
                dir="ltr"
                value={(cfg.r2StorageLimitGb ?? 10) + (cfg.b2StorageLimitGb ?? 10)}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-left text-sm font-bold text-slate-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div
              className={`rounded-xl border px-3 py-2.5 text-xs ${
                providerSummary.b2.enabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">Backblaze B2 الأساسي ({cfg.b2StorageLimitGb ?? 10} GB)</span>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-bold">
                  {providerSummary.b2.enabled
                    ? 'متصل ومفعّل فعلياً'
                    : b2LiveVerified
                      ? 'جاهز للتفعيل'
                      : 'بانتظار الأسرار / التحقق'}
                </span>
              </div>
              <p className="mt-1 text-[11px] opacity-90">{providerSummary.b2.statusMessage}</p>
              {b2LiveVerified && (
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 font-bold">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={liveQuota?.b2?.enabled === true || cfg.b2Enabled === true}
                    onChange={(e) => setCfg({ ...cfg, b2Enabled: e.target.checked })}
                  />
                  تفعيل Backblaze B2 كمزوّد التخزين الأساسي ({cfg.b2StorageLimitGb ?? 10} GB)
                </label>
              )}
            </div>

            <div
              className={`rounded-xl border px-3 py-2.5 text-xs ${
                providerSummary.r2.verified
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">Cloudflare R2 ثانوي ({cfg.r2StorageLimitGb ?? 10} GB)</span>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-bold">
                  {providerSummary.r2.verified ? 'متصل ومتحقق فعلياً' : 'غير مربوط / ثانوي'}
                </span>
              </div>
              <p className="mt-1 text-[11px] opacity-90">{providerSummary.r2.statusMessage}</p>
            </div>
          </div>

          {r2HealthMsg && (
            <p
              className={`rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
                r2HealthError
                  ? 'bg-rose-50 text-rose-800 ring-rose-200'
                  : 'bg-white text-[#142A43] ring-slate-200'
              }`}
            >
              {r2HealthMsg}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={savingToggles}
          onClick={() => void saveToggles()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#142A43] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {savingToggles
            ? 'جاري الحفظ...'
            : isSuperAdmin
              ? 'حفظ الإعدادات العامة وحدود التخزين'
              : 'حفظ الإعدادات العامة فقط'}
        </button>
      </div>

      {/* Over-the-Top In-App Android Release Publisher */}
      <form onSubmit={handlePublishAndroidRelease} className="space-y-4 rounded-2xl border border-teal-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[#167D83]">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#142A43]">نشر تحديث تطبيق مداد (Android In-App Update)</h3>
              <p className="text-xs text-slate-500">
                يُحفظ في <code className="rounded bg-slate-100 px-1">appConfig/android_release</code> مع التحقق من HTTPS وبصمة SHA-256 للحفاظ على بيانات الطلاب دون حذف التطبيق.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRelease({ ...release, apkUrl: PERMANENT_MIDAD_APK_URL })}
            className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100"
          >
            تعبئة رابط Midad.apk الدائم
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">رقم البناء (versionCode) *</label>
            <input
              type="number"
              min={1}
              required
              dir="ltr"
              value={release.versionCode}
              onChange={(e) => setRelease({ ...release, versionCode: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">اسم الإصدار (versionName) *</label>
            <input
              required
              dir="ltr"
              value={release.versionName}
              onChange={(e) => setRelease({ ...release, versionName: e.target.value })}
              placeholder="1.1.1"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">أقل إصدار مدعوم (إلزامي تحته)</label>
            <input
              type="number"
              min={0}
              dir="ltr"
              value={release.minSupportedVersionCode ?? 0}
              onChange={(e) => setRelease({ ...release, minSupportedVersionCode: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">رابط تحميل APK الدائم (HTTPS فقط) *</label>
            <input
              type="url"
              required
              dir="ltr"
              value={release.apkUrl}
              onChange={(e) => setRelease({ ...release, apkUrl: e.target.value })}
              placeholder={PERMANENT_MIDAD_APK_URL}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">حجم الملف بالبايت (اختياري)</label>
            <input
              type="number"
              min={0}
              dir="ltr"
              value={release.fileSizeBytes ?? 0}
              onChange={(e) => setRelease({ ...release, fileSizeBytes: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">بصمة SHA-256 لملف APK (64 خانة hex) *</label>
            <input
              required
              dir="ltr"
              pattern="[a-fA-F0-9]{64}"
              value={release.sha256}
              onChange={(e) => setRelease({ ...release, sha256: e.target.value })}
              placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left font-mono text-xs"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">ملاحظات الإصدار للطلاب</label>
            <textarea
              rows={3}
              value={release.releaseNotes}
              onChange={(e) => setRelease({ ...release, releaseNotes: e.target.value })}
              placeholder="تحسين الأداء، دعم الوضع الليلي، وإصلاحات..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-900">
            <input
              type="checkbox"
              checked={release.mandatory}
              onChange={(e) => setRelease({ ...release, mandatory: e.target.checked })}
            />
            تحديث إجباري لجميع الطلاب على هذا الإصدار
          </label>
          <button
            type="submit"
            disabled={publishingRelease}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#167D83] px-5 py-2.5 text-xs font-bold text-white"
          >
            <Save className="h-4 w-4" />
            {publishingRelease ? 'جاري النشر...' : 'نشر إشعار التحديث للتطبيق'}
          </button>
        </div>
      </form>

      <form onSubmit={addCustomSectionType} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-[#142A43]">أنواع الأقسام المخصصة داخل الدروس (Custom Sections)</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            required
            dir="ltr"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="formula_sheet"
            className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
          />
          <input
            required
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="ورقة قوانين / خريطة ذهنية"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="وصف مختصر"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">
          <Plus className="h-4 w-4" />
          إضافة نوع قسم مخصص
        </button>

        {store.customTypes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {store.customTypes.map((ct) => (
              <span key={ct.id} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">
                {ct.labelAr} ({ct.key})
              </span>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
