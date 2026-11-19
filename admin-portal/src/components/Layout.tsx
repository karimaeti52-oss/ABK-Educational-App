import React, { useState } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  DatabaseBackup,
  FileText,
  FolderTree,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  PlaySquare,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { NavSectionId, PlatformConfig, StaffSession } from '../types';
import { ROLE_LABELS } from '../types';

export interface NavItem {
  id: NavSectionId;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  minRoles?: StaffSession['role'][];
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '1. الرئيسية والإحصائيات', group: 'القيادة', icon: LayoutDashboard },
  { id: 'stages', label: '2. المراحل والصفوف', group: 'الهيكلة الأكاديمية', icon: FolderTree },
  { id: 'branches', label: '3. إدارة الفروع', group: 'الهيكلة الأكاديمية', icon: GitBranch },
  { id: 'subjects', label: '4. إدارة المواد', group: 'الهيكلة الأكاديمية', icon: BookOpen },
  { id: 'units', label: '5. إدارة الوحدات', group: 'الهيكلة الأكاديمية', icon: Layers },
  { id: 'lessons', label: '6. إدارة الدروس', group: 'الدروس والأساتذة', icon: PlaySquare },
  { id: 'teachers', label: '7. إدارة الأساتذة', group: 'الدروس والأساتذة', icon: UserCheck },
  { id: 'explanations', label: '8. ربط الأساتذة بالدروس', group: 'الدروس والأساتذة', icon: Users },
  { id: 'videos', label: '9. إدارة الفيديوهات', group: 'الوسائط والمحتوى', icon: Video },
  { id: 'materials', label: '10. ملفات PDF والنوطات', group: 'الوسائط والمحتوى', icon: FileText },
  { id: 'quizzes', label: '11. الأسئلة والاختبارات', group: 'الوسائط والمحتوى', icon: HelpCircle },
  { id: 'media', label: '12. الصور ومكتبة الملفات', group: 'الوسائط والمحتوى', icon: ImageIcon },
  { id: 'students', label: '13. حسابات الطلاب', group: 'المستخدمون والصلاحيات', icon: Users },
  {
    id: 'admins',
    label: '14. المشرفون والصلاحيات',
    group: 'المستخدمون والصلاحيات',
    icon: ShieldCheck,
    minRoles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    id: 'branding',
    label: '15. الهوية والتصميم',
    group: 'الهوية والنظام',
    icon: Palette,
    minRoles: ['SUPER_ADMIN', 'ADMIN'],
  },
  { id: 'announcements', label: '16. التنبيهات والإعلانات', group: 'الهوية والنظام', icon: Bell },
  { id: 'audit', label: '17. سجل العمليات الإدارية', group: 'الهوية والنظام', icon: Activity },
  {
    id: 'backups',
    label: '18. النسخ الاحتياطي',
    group: 'الهوية والنظام',
    icon: DatabaseBackup,
    minRoles: ['SUPER_ADMIN'],
  },
  {
    id: 'settings',
    label: '19. إعدادات المنصة',
    group: 'الهوية والنظام',
    icon: Settings,
    minRoles: ['SUPER_ADMIN', 'ADMIN'],
  },
];

export function AdminLayout({
  activeSection,
  onSelectSection,
  staff,
  platformConfig,
  idleSecondsLeft,
  onReauth,
  onSignOut,
  children,
}: {
  activeSection: NavSectionId;
  onSelectSection: (id: NavSectionId) => void;
  staff: StaffSession;
  platformConfig: PlatformConfig;
  idleSecondsLeft: number;
  onReauth: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.minRoles || item.minRoles.includes(staff.role)
  );
  const groups = Array.from(new Set(visibleItems.map((i) => i.group)));

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0F294A] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          {platformConfig.logoUrl ? (
            <img
              src={platformConfig.logoUrl}
              alt={platformConfig.platformName}
              className="h-9 w-9 rounded-xl bg-white object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-sm font-extrabold text-white">
              ABK
            </div>
          )}
          <div>
            <p className="text-sm font-extrabold leading-tight">{platformConfig.platformName} Admin</p>
            <p className="text-[11px] text-sky-200">لوحة التحكم المستقلة</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1 text-white/70 hover:bg-white/10 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {groups.map((grp) => (
          <div key={grp}>
            <p className="mb-1.5 px-2.5 text-[11px] font-bold tracking-wide text-sky-300/80">{grp}</p>
            <div className="space-y-1">
              {visibleItems
                .filter((i) => i.group === grp)
                .map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-xs font-semibold transition ${
                        active
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'text-slate-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3 text-xs">
        <div className="mb-2 rounded-xl bg-white/5 p-2.5">
          <p className="truncate font-bold text-white">{staff.name || staff.email}</p>
          <p className="truncate text-[11px] text-sky-200">{ROLE_LABELS[staff.role]}</p>
          <p className="mt-1 text-[10px] text-slate-300">
            {staff.backendOnline ? 'خادم RBAC الموثوق: متصل' : 'وضع Firestore المباشر (الخادم غير مشغل)'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReauth}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 py-2 font-semibold text-white hover:bg-white/20"
            title="إعادة توثيق الجلسة"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            توثيق
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-500/20 py-2 font-semibold text-rose-200 hover:bg-rose-500/30"
          >
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-72 shrink-0 lg:block">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-72 shrink-0 shadow-2xl">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="القائمة"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-[#0F294A] sm:text-base">
                {ADMIN_NAV_ITEMS.find((n) => n.id === activeSection)?.label || 'لوحة التحكم'}
              </h1>
              <p className="text-xs text-slate-500">
                قاعدة البيانات: ABK المشتركة • {staff.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span
              className={`hidden rounded-full px-2.5 py-1 font-semibold sm:inline-flex ${
                idleSecondsLeft < 180
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              قفل الجلسة التلقائي: {Math.ceil(idleSecondsLeft / 60)} د
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
