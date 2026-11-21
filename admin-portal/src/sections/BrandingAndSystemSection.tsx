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
  const [saving, setSaving] = useState(false);

  const navItems: BottomNavConfigItem[] =
    draft.bottomNavItems?.length
      ? draft.bottomNavItems
      : DEFAULT_PLATFORM_CONFIG.bottomNavItems!;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await savePlatformConfig({ ...draft, bottomNavItems: navItems }, staff);
      onToast('تم حفظ وتطبيق هوية وتصميم المنصة مباشرة على تطبيق Android');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل حفظ التصميم', true);
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
                onChange={(e) => setDraft({ ...draft, platformName: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الوصف الفرعي للشعار</label>
              <input
                value={draft.platformTagline}
                onChange={(e) => setDraft({ ...draft, platformTagline: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان القسم الرئيسي (مثال: ماذا تدرس؟) *</label>
              <input
                required
                value={draft.homeHeadline}
                onChange={(e) => setDraft({ ...draft, homeHeadline: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان بطاقة الترحيب</label>
              <input
                value={draft.welcomeTitle}
                onChange={(e) => setDraft({ ...draft, welcomeTitle: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">النص الترحيبي</label>
              <input
                value={draft.welcomeSubtitle}
                onChange={(e) => setDraft({ ...draft, welcomeSubtitle: e.target.value })}
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
                  onChange={(e) => setDraft({ ...draft, primaryColorHex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                />
                <input
                  dir="ltr"
                  value={draft.primaryColorHex}
                  onChange={(e) => setDraft({ ...draft, primaryColorHex: e.target.value })}
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
                  onChange={(e) => setDraft({ ...draft, secondaryColorHex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                />
                <input
                  dir="ltr"
                  value={draft.secondaryColorHex}
                  onChange={(e) => setDraft({ ...draft, secondaryColorHex: e.target.value })}
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
                  onChange={(e) => setDraft({ ...draft, accentColorHex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
                />
                <input
                  dir="ltr"
                  value={draft.accentColorHex || '#C7A15A'}
                  onChange={(e) => setDraft({ ...draft, accentColorHex: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-left text-xs"
                />
              </div>
            </div>
          </div>

          <AssetUrlOrUploadInput
            label="شعار المنصة (Logo)"
            value={draft.logoUrl || ''}
            onChange={(url) => setDraft({ ...draft, logoUrl: url })}
            folderPath="branding"
            imageOnly
            onToast={onToast}
          />
          <AssetUrlOrUploadInput
            label="صورة بانر الترحيب (Hero Banner)"
            value={draft.heroBannerUrl || ''}
            onChange={(url) => setDraft({ ...draft, heroBannerUrl: url })}
            folderPath="branding"
            imageOnly
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
                      setDraft({ ...draft, bottomNavItems: next });
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
                        setDraft({ ...draft, bottomNavItems: next });
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

  useEffect(() => {
    const unsub = subscribeAndroidRelease((manifest) => {
      setRelease(manifest);
    });
    return () => unsub();
  }, []);

  async function saveToggles() {
    await savePlatformConfig(cfg, staff);
    onToast('تم حفظ إعدادات المنصة العامة');
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
        <button
          type="button"
          onClick={saveToggles}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#142A43] px-5 py-2.5 text-xs font-bold text-white"
        >
          <Check className="h-4 w-4" />
          حفظ الإعدادات العامة
        </button>
      </div>

      {/* Over-the-Top In-App Android Release Publisher */}
      <form onSubmit={handlePublishAndroidRelease} className="space-y-4 rounded-2xl border border-teal-200 bg-white p-5">
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
              placeholder="1.1.0"
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
            <label className="mb-1 block text-xs font-semibold text-slate-600">رابط تحميل APK (HTTPS فقط) *</label>
            <input
              type="url"
              required
              dir="ltr"
              value={release.apkUrl}
              onChange={(e) => setRelease({ ...release, apkUrl: e.target.value })}
              placeholder="https://github.com/org/repo/releases/download/v1.1.0/midad-release.apk"
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
