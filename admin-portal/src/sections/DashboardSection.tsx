import {
  BookOpen,
  FileText,
  FolderTree,
  Layers,
  PlaySquare,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import type { CmsStore } from '../services/firestoreCms';
import type { NavSectionId } from '../types';

export function DashboardSection({
  store,
  onNavigate,
}: {
  store: CmsStore;
  onNavigate: (section: NavSectionId) => void;
}) {
  const activeNodes = store.nodes.filter((n) => !n.deletedAt);
  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const activeLessons = store.lessons.filter((l) => !l.deletedAt);
  const activeTeachers = store.teachers.filter((t) => !t.deletedAt);
  const activeExplanations = store.explanations.filter((e) => !e.deletedAt);
  const activeBlocks = store.blocks.filter((b) => !b.deletedAt);
  const activeMaterials = store.materials.filter((m) => !m.deletedAt);

  const activeUsersCount = store.users.filter((u) => u.accountStatus === 'ACTIVE').length;
  const suspendedUsersCount = store.users.filter((u) => u.accountStatus === 'SUSPENDED').length;
  const bannedUsersCount = store.users.filter((u) => u.accountStatus === 'BANNED').length;

  const cards = [
    {
      label: 'الطلاب والحسابات المسجلة',
      value: store.users.length,
      sub: `${activeUsersCount} نشط • ${suspendedUsersCount} معطل • ${bannedUsersCount} محظور`,
      icon: Users,
      color: 'bg-sky-50 text-sky-700 border-sky-200',
      nav: 'students' as NavSectionId,
    },
    {
      label: 'المراحل والصفوف والفروع',
      value: activeNodes.length,
      sub: `${activeNodes.filter((n) => n.published).length} منشور`,
      icon: FolderTree,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      nav: 'stages' as NavSectionId,
    },
    {
      label: 'المواد الدراسية',
      value: activeSubjects.length,
      sub: `${store.units.filter((u) => !u.deletedAt).length} وحدة تعليمية`,
      icon: BookOpen,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      nav: 'subjects' as NavSectionId,
    },
    {
      label: 'الدروس والشروحات',
      value: activeLessons.length,
      sub: `${activeExplanations.length} شرح مستقل • ${activeBlocks.length} كتلة`,
      icon: PlaySquare,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      nav: 'explanations' as NavSectionId,
    },
    {
      label: 'الأساتذة',
      value: activeTeachers.length,
      sub: `${activeTeachers.filter((t) => t.published).length} ظاهر للطلاب`,
      icon: UserCheck,
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      nav: 'teachers' as NavSectionId,
    },
    {
      label: 'ملفات PDF والنوطات',
      value: activeMaterials.length,
      sub: `${store.announcements.filter((a) => !a.deletedAt).length} إعلان`,
      icon: FileText,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      nav: 'materials' as NavSectionId,
    },
  ];

  const publishedCount =
    activeSubjects.filter((s) => s.published).length +
    activeLessons.filter((l) => l.published).length +
    activeExplanations.filter((e) => e.published).length +
    activeBlocks.filter((b) => b.published).length;
  const draftCount =
    activeSubjects.filter((s) => !s.published).length +
    activeLessons.filter((l) => !l.published).length +
    activeExplanations.filter((e) => !e.published).length +
    activeBlocks.filter((b) => !b.published).length;
  const totalItems = Math.max(1, publishedCount + draftCount);

  return (
    <div className="space-y-6">
      {store.platformConfig.maintenanceMode && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-bold">وضع الصيانة مفعّل حالياً</p>
            <p className="text-xs text-amber-700">يمكنك إيقافه من قسم إعدادات المنصة العامة.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onNavigate(c.nav)}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-xs transition hover:border-sky-300 hover:shadow-md"
            >
              <div>
                <p className="text-xs font-semibold text-slate-500">{c.label}</p>
                <p className="mt-1 text-3xl font-extrabold text-[#0F294A]">{c.value}</p>
                <p className="mt-1 text-xs text-slate-500">{c.sub}</p>
              </div>
              <div className={`rounded-2xl border p-3.5 ${c.color}`}>
                <Icon className="h-6 w-6" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-[#0F294A]">حالة نشر المحتوى التعليمي</h3>
            <Layers className="h-5 w-5 text-sky-600" />
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span className="text-emerald-700">منشور ومتاح للطلاب ({publishedCount})</span>
                <span>{Math.round((publishedCount / totalItems) * 100)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round((publishedCount / totalItems) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span className="text-amber-700">مسودات وأرشيف قيد الإعداد ({draftCount})</span>
                <span>{Math.round((draftCount / totalItems) * 100)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.round((draftCount / totalItems) * 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <button
                type="button"
                onClick={() => onNavigate('explanations')}
                className="rounded-xl bg-[#0F294A] px-3 py-2.5 font-semibold text-white hover:bg-[#153B6B]"
              >
                + ربط أستاذ بدرس
              </button>
              <button
                type="button"
                onClick={() => onNavigate('branding')}
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 font-semibold text-sky-800 hover:bg-sky-100"
              >
                تعديل واجهة التطبيق
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-[#0F294A]">أحدث العمليات الإدارية</h3>
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="text-xs font-semibold text-sky-600 hover:underline"
            >
              عرض السجل الكامل
            </button>
          </div>
          {store.auditLogs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">لا توجد عمليات مسجلة بعد.</p>
          ) : (
            <div className="space-y-2.5">
              {store.auditLogs.slice(0, 6).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{log.summary || log.action}</p>
                    <p className="text-[11px] text-slate-500">
                      {log.actorEmail || log.actorUid} • {log.entityType}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {log.action}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
