import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Lock, LogIn, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ApiError, checkBackendHealth, fetchBackendSession } from './api';
import { AdminLayout } from './components/Layout';
import {
  firebaseAuth,
  firestoreDb,
  googleProvider,
  SUPER_ADMIN_EMAIL,
} from './firebase';
import {
  DEFAULT_PLATFORM_CONFIG,
  subscribeCollection,
  subscribePlatformConfig,
  type CmsStore,
} from './services/firestoreCms';
import {
  BrandingSection,
  AnnouncementsSection,
  AuditLogsSection,
  BackupsSection,
  PlatformSettingsSection,
} from './sections/BrandingAndSystemSection';
import {
  CatalogNodesSection,
  SubjectsSection,
  UnitsSection,
} from './sections/CatalogAndSubjectsSection';
import { DashboardSection } from './sections/DashboardSection';
import {
  LessonsSection,
  MaterialsSection,
  MediaLibrarySection,
  QuizzesOverviewSection,
  VideosOverviewSection,
} from './sections/LessonsAndContentSection';
import {
  ExplanationsAndBlocksSection,
  TeachersSection,
} from './sections/TeachersAndExplanationsSection';
import { AdminsRbacSection, StudentsSection } from './sections/UsersAndAdminsSection';
import type {
  AdminEntry,
  Announcement,
  AuditLog,
  BackupSnapshot,
  CatalogNode,
  ContentBlock,
  CustomSectionType,
  Lesson,
  LessonExplanation,
  NavSectionId,
  PlatformConfig,
  StaffRole,
  StaffSession,
  StudyMaterial,
  Subject,
  Teacher,
  UnitItem,
  UserProfile,
} from './types';

const IDLE_TIMEOUT_SECONDS = 30 * 60;

const EMPTY_STORE: CmsStore = {
  nodes: [],
  subjects: [],
  units: [],
  teachers: [],
  lessons: [],
  explanations: [],
  blocks: [],
  customTypes: [],
  materials: [],
  announcements: [],
  users: [],
  admins: [],
  auditLogs: [],
  backups: [],
  platformConfig: DEFAULT_PLATFORM_CONFIG,
};

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');
  const [store, setStore] = useState<CmsStore>(EMPTY_STORE);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(IDLE_TIMEOUT_SECONDS);
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);
  const [showReauthModal, setShowReauthModal] = useState(false);

  const showToast = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const resolveStaffSession = useCallback(async (user: User): Promise<StaffSession | null> => {
    const email = (user.email || '').trim().toLowerCase();
    const backendUp = await checkBackendHealth();

    if (backendUp) {
      try {
        const session = await fetchBackendSession();
        return {
          ...session,
          backendOnline: true,
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          throw new Error(err.message);
        }
        // Fall through to Firestore check only if network/service error
      }
    }

    // Fallback when running static frontend without Node server:
    // Check ID token claims + Firestore /admins/{uid} + designated Super Admin bootstrap email
    const tokenResult = await user.getIdTokenResult();
    const claimRole = tokenResult.claims.role as StaffRole | undefined;
    const claimStaff = tokenResult.claims.abkStaff === true || tokenResult.claims.admin === true;

    let adminDocRole: StaffRole | undefined;
    let adminPermissions: string[] = [];
    let teacherId: string | null = null;
    try {
      const snap = await getDoc(doc(firestoreDb, 'admins', user.uid));
      if (snap.exists()) {
        const data = snap.data() as Partial<AdminEntry>;
        if (data.active === false) {
          throw new Error('تم تعطيل صلاحية هذا الحساب الإداري.');
        }
        adminDocRole = (data.role as StaffRole | undefined) || 'ADMIN';
        adminPermissions = Array.isArray(data.permissions) ? data.permissions : [];
        teacherId = data.teacherId || null;
      }
    } catch (docErr) {
      if (docErr instanceof Error && docErr.message.includes('تعطيل')) {
        throw docErr;
      }
    }

    const isSuperEmail = email === SUPER_ADMIN_EMAIL.toLowerCase();
    const resolvedRole: StaffRole | null = isSuperEmail
      ? 'SUPER_ADMIN'
      : claimStaff && claimRole
        ? claimRole
        : adminDocRole || null;

    if (!resolvedRole) {
      return null;
    }

    return {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || user.email || 'مشرف ABK',
      role: resolvedRole,
      permissions: adminPermissions,
      teacherId: teacherId || (tokenResult.claims.teacherId as string | undefined) || null,
      authTime: Math.floor(Date.now() / 1000),
      mfaVerified: Boolean((tokenResult.claims.firebase as { sign_in_second_factor?: unknown } | undefined)?.sign_in_second_factor),
      backendOnline: false,
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      if (!user) {
        setStaff(null);
        setAuthReady(true);
        return;
      }
      setAuthLoading(true);
      try {
        const resolved = await resolveStaffSession(user);
        if (!resolved) {
          setStaff(null);
          setAuthError(
            `الحساب (${user.email}) غير مخوّل للدخول إلى لوحة الإدارة. يجب منحه صلاحية إدارية من المدير العام.`
          );
        } else {
          setStaff(resolved);
          setIdleSecondsLeft(IDLE_TIMEOUT_SECONDS);
        }
      } catch (err) {
        setStaff(null);
        setAuthError(err instanceof Error ? err.message : 'تعذر التحقق من صلاحيات الحساب.');
      } finally {
        setAuthLoading(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [resolveStaffSession]);

  // Live Firestore subscriptions while verified staff is signed in
  useEffect(() => {
    if (!staff) {
      setStore(EMPTY_STORE);
      return;
    }

    const silentIgnore = () => {};
    const unsubs = [
      subscribePlatformConfig((platformConfig: PlatformConfig) =>
        setStore((prev) => ({ ...prev, platformConfig }))
      ),
      subscribeCollection<CatalogNode>('catalogNodes', (nodes) =>
        setStore((prev) => ({ ...prev, nodes }))
      ),
      subscribeCollection<Subject>('subjects', (subjects) =>
        setStore((prev) => ({ ...prev, subjects }))
      ),
      subscribeCollection<UnitItem>('units', (units) =>
        setStore((prev) => ({ ...prev, units }))
      ),
      subscribeCollection<Teacher>('teachers', (teachers) =>
        setStore((prev) => ({ ...prev, teachers }))
      ),
      subscribeCollection<Lesson>('lessons', (lessons) =>
        setStore((prev) => ({ ...prev, lessons }))
      ),
      subscribeCollection<LessonExplanation>('lessonExplanations', (explanations) =>
        setStore((prev) => ({ ...prev, explanations }))
      ),
      subscribeCollection<ContentBlock>('contentBlocks', (blocks) =>
        setStore((prev) => ({ ...prev, blocks }))
      ),
      subscribeCollection<CustomSectionType>('customSectionTypes', (customTypes) =>
        setStore((prev) => ({ ...prev, customTypes }))
      ),
      subscribeCollection<StudyMaterial>('materials', (materials) =>
        setStore((prev) => ({ ...prev, materials }))
      ),
      subscribeCollection<Announcement>('announcements', (announcements) =>
        setStore((prev) => ({ ...prev, announcements }))
      ),
      subscribeCollection<UserProfile>(
        'users',
        (users) => setStore((prev) => ({ ...prev, users })),
        silentIgnore
      ),
      subscribeCollection<AdminEntry>(
        'admins',
        (admins) => setStore((prev) => ({ ...prev, admins })),
        silentIgnore
      ),
      subscribeCollection<AuditLog>(
        'auditLogs',
        (auditLogs) => setStore((prev) => ({ ...prev, auditLogs })),
        silentIgnore
      ),
      subscribeCollection<BackupSnapshot>(
        'backups',
        (backups) => setStore((prev) => ({ ...prev, backups })),
        silentIgnore
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [staff]);

  const handleSignOut = useCallback(async () => {
    await signOut(firebaseAuth);
    setStaff(null);
    setActiveSection('dashboard');
  }, []);

  // Session idle timeout monitor
  useEffect(() => {
    if (!staff) return;
    const resetIdle = () => setIdleSecondsLeft(IDLE_TIMEOUT_SECONDS);
    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const;
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));

    const interval = window.setInterval(() => {
      setIdleSecondsLeft((sec) => {
        if (sec <= 1) {
          void handleSignOut();
          return 0;
        }
        return sec - 1;
      });
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      window.clearInterval(interval);
    };
  }, [staff, handleSignOut]);

  async function handleGoogleLogin() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'فشل تسجيل الدخول بحساب Google. تأكد من السماح بالنوافذ المنبثقة.'
      );
      setAuthLoading(false);
    }
  }

  async function handleReauthConfirm() {
    if (!firebaseAuth.currentUser) return;
    try {
      await reauthenticateWithPopup(firebaseAuth.currentUser, googleProvider);
      await firebaseAuth.currentUser.getIdToken(true);
      const updated = await resolveStaffSession(firebaseAuth.currentUser);
      if (updated) setStaff(updated);
      setShowReauthModal(false);
      showToast('تم إعادة توثيق الجلسة وتحديث التوكن بنجاح');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشلت إعادة التوثيق', true);
    }
  }

  if (!authReady || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
          <p className="text-sm font-bold text-[#0F294A]">جاري التحقق من الجلسة وصلاحيات الإدارة...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0F294A] via-[#133863] to-sky-700 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F294A] text-lg font-extrabold text-white shadow-sm">
              ABK
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#0F294A]">لوحة تحكم منصة ABK</h1>
              <p className="text-xs text-slate-500">بوابة الإدارة المستقلة — دخول المشرفين والأساتذة المخوّلين فقط</p>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-xs leading-relaxed text-sky-900">
            <div className="mb-1 flex items-center gap-1.5 font-bold">
              <Lock className="h-4 w-4 text-sky-600" />
              حماية الوصول الإداري
            </div>
            لا يوجد تسجيل حسابات عامة في لوحة التحكم. الدخول مقتصر على الحسابات الموثقة ذات الصلاحية الإدارية في Firebase.
          </div>

          {authError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <div className="mb-1 flex items-center gap-1.5 font-bold">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                تعذر الدخول
              </div>
              <p>{authError}</p>
              {firebaseUser && (
                <p className="mt-2 font-mono text-[11px] text-rose-700" dir="ltr">
                  UID: {firebaseUser.uid}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F294A] px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-sky-700"
          >
            <LogIn className="h-4 w-4" />
            تسجيل الدخول بحساب Google الإداري
          </button>

          {firebaseUser && (
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 w-full rounded-2xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              تسجيل الخروج من {firebaseUser.email}
            </button>
          )}
        </div>
      </div>
    );
  }

  const canManageStructure = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'].includes(staff.role);
  const canEditLessonsAndContent = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'TEACHER'].includes(
    staff.role
  );
  const canHardDelete = ['SUPER_ADMIN', 'ADMIN'].includes(staff.role);

  function renderSection() {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardSection store={store} onNavigate={setActiveSection} />;
      case 'stages':
        return (
          <CatalogNodesSection
            mode="stages"
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'branches':
        return (
          <CatalogNodesSection
            mode="branches"
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'subjects':
        return (
          <SubjectsSection
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'units':
        return (
          <UnitsSection
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'lessons':
        return (
          <LessonsSection
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onNavigate={setActiveSection}
            onToast={showToast}
          />
        );
      case 'teachers':
        return (
          <TeachersSection
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'explanations':
        return (
          <ExplanationsAndBlocksSection
            store={store}
            staff={staff!}
            canEdit={canEditLessonsAndContent}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'videos':
        return <VideosOverviewSection store={store} onNavigate={setActiveSection} />;
      case 'materials':
        return (
          <MaterialsSection
            store={store}
            staff={staff!}
            canEdit={canEditLessonsAndContent}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'quizzes':
        return <QuizzesOverviewSection store={store} onNavigate={setActiveSection} />;
      case 'media':
        return <MediaLibrarySection onToast={showToast} />;
      case 'students':
        return <StudentsSection store={store} staff={staff!} onToast={showToast} />;
      case 'admins':
        return (
          <AdminsRbacSection
            store={store}
            staff={staff!}
            onRequireReauth={() => setShowReauthModal(true)}
            onToast={showToast}
          />
        );
      case 'branding':
        return <BrandingSection store={store} staff={staff!} onToast={showToast} />;
      case 'announcements':
        return (
          <AnnouncementsSection
            store={store}
            staff={staff!}
            canEdit={canManageStructure}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'audit':
        return <AuditLogsSection store={store} />;
      case 'backups':
        return (
          <BackupsSection
            store={store}
            staff={staff!}
            onRequireReauth={() => setShowReauthModal(true)}
            onToast={showToast}
          />
        );
      case 'settings':
        return <PlatformSettingsSection store={store} staff={staff!} onToast={showToast} />;
      default:
        return <DashboardSection store={store} onNavigate={setActiveSection} />;
    }
  }

  return (
    <AdminLayout
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      staff={staff}
      platformConfig={store.platformConfig}
      idleSecondsLeft={idleSecondsLeft}
      onReauth={() => setShowReauthModal(true)}
      onSignOut={handleSignOut}
    >
      {renderSection()}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold text-white shadow-xl ${
            toast.isError ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.isError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Re-Authentication Confirmation Modal */}
      {showReauthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-[#0F294A]">
              <ShieldCheck className="h-5 w-5 text-sky-600" />
              <h3 className="text-base font-bold">إعادة توثيق الجلسة الحساسة</h3>
            </div>
            <p className="mb-5 text-xs leading-relaxed text-slate-600">
              لتنفيذ عمليات عالية الحساسية (منح الصلاحيات الإدارية، الاستعادة من نسخة احتياطية)، يجب تأكيد هويتك بحساب Google الآن لتحديث شهادة الجلسة.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReauthModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReauthConfirm}
                className="rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white hover:bg-sky-700"
              >
                تأكيد عبر Google
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
