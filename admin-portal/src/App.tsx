import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Copy, Lock, LogIn, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { checkBackendHealth, fetchBackendSession } from './api';
import { AdminLayout } from './components/Layout';
import {
  firebaseAuth,
  firestoreDb,
  googleProvider,
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
  MediaAsset,
  NavSectionId,
  PlatformConfig,
  StaffSession,
  StudyMaterial,
  Subject,
  Teacher,
  UnitItem,
  UserProfile,
} from './types';
import {
  createAuthRequestGuard,
  formatGooglePopupErrorMessage,
  resolveAdminPortalSession,
  type ClientAdminAccessDiagnosis,
} from './utils/staffRole';

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
  mediaAssets: [],
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
  const [authDiagnosis, setAuthDiagnosis] = useState<ClientAdminAccessDiagnosis | null>(null);
  const authGuardRef = useRef(createAuthRequestGuard());

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

  const resolveStaffSession = useCallback(
    async (
      user: User,
      forceRefreshToken = false
    ): Promise<{ session: StaffSession | null; diagnosis: ClientAdminAccessDiagnosis | null }> => {
      return resolveAdminPortalSession({
        user,
        forceRefreshToken,
        checkBackendHealth,
        fetchBackendSession,
        readIdTokenResult: (forceRefresh) => user.getIdTokenResult(forceRefresh),
        readOwnAdminDoc: (targetUid) => getDoc(doc(firestoreDb, 'admins', targetUid)),
      });
    },
    []
  );

  const applyUserSessionEvaluation = useCallback(
    async (
      user: User,
      requestId: number,
      forceRefreshToken: boolean,
      toastOnSuccess?: string
    ) => {
      if (!authGuardRef.current.isCurrent(requestId, user.uid)) {
        return;
      }
      setAuthLoading(true);
      try {
        const { session, diagnosis } = await resolveStaffSession(user, forceRefreshToken);
        if (!authGuardRef.current.isCurrent(requestId, user.uid)) {
          return;
        }
        if (!session) {
          setStaff(null);
          setAuthDiagnosis(diagnosis);
          setAuthError(
            diagnosis?.primaryMessage ||
              `الحساب (${user.email}) غير مخوّل للدخول إلى لوحة الإدارة. يجب منحه صلاحية إدارية من المدير العام.`
          );
        } else {
          setStaff(session);
          setAuthDiagnosis(null);
          setAuthError(null);
          setIdleSecondsLeft(IDLE_TIMEOUT_SECONDS);
          if (toastOnSuccess) {
            showToast(toastOnSuccess);
          }
        }
      } catch (err) {
        if (!authGuardRef.current.isCurrent(requestId, user.uid)) {
          return;
        }
        setStaff(null);
        setAuthDiagnosis(null);
        setAuthError(err instanceof Error ? err.message : 'تعذر التحقق من صلاحيات الحساب.');
      } finally {
        if (authGuardRef.current.isCurrent(requestId, user.uid)) {
          setAuthLoading(false);
          setAuthReady(true);
        }
      }
    },
    [resolveStaffSession, showToast]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      const requestId = authGuardRef.current.begin(user?.uid ?? null);
      setFirebaseUser(user);
      setAuthError(null);
      setAuthDiagnosis(null);
      if (!user) {
        setStaff(null);
        setAuthLoading(false);
        setAuthReady(true);
        return;
      }
      void applyUserSessionEvaluation(user, requestId, false);
    });
    return () => {
      unsub();
      authGuardRef.current.invalidate();
    };
  }, [applyUserSessionEvaluation]);

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
      subscribeCollection<MediaAsset>('mediaAssets', (mediaAssets) =>
        setStore((prev) => ({ ...prev, mediaAssets }))
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
    authGuardRef.current.invalidate();
    setStaff(null);
    setAuthError(null);
    setAuthDiagnosis(null);
    setAuthLoading(false);
    setActiveSection('dashboard');
    await signOut(firebaseAuth);
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
    authGuardRef.current.invalidate();
    setAuthError(null);
    setAuthDiagnosis(null);
    setAuthLoading(true);
    const previousUid = firebaseAuth.currentUser?.uid ?? null;
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      if (credential?.user && previousUid && credential.user.uid === previousUid) {
        const requestId = authGuardRef.current.begin(credential.user.uid);
        await applyUserSessionEvaluation(credential.user, requestId, true);
      }
    } catch (err) {
      authGuardRef.current.invalidate();
      setAuthDiagnosis(null);
      setAuthError(formatGooglePopupErrorMessage(err));
      setAuthLoading(false);
    }
  }

  async function handleReauthConfirm() {
    const current = firebaseAuth.currentUser;
    if (!current) return;
    const requestId = authGuardRef.current.begin(current.uid);
    try {
      await reauthenticateWithPopup(current, googleProvider);
      const { session, diagnosis } = await resolveStaffSession(current, true);
      if (!authGuardRef.current.isCurrent(requestId, current.uid)) {
        return;
      }
      if (session) {
        setStaff(session);
        setAuthDiagnosis(null);
        setAuthError(null);
        setShowReauthModal(false);
        showToast('تم إعادة توثيق الجلسة وتحديث التوكن بنجاح');
      } else {
        setStaff(null);
        setAuthDiagnosis(diagnosis);
        setAuthError(diagnosis?.primaryMessage || 'تم رفض الجلسة بعد إعادة التوثيق.');
        setShowReauthModal(false);
      }
    } catch (err) {
      if (!authGuardRef.current.isCurrent(requestId, current.uid)) {
        return;
      }
      showToast(err instanceof Error ? err.message : 'فشلت إعادة التوثيق', true);
    }
  }

  async function handleRefreshAuthCheck() {
    const current = firebaseAuth.currentUser;
    if (!current) return;
    const requestId = authGuardRef.current.begin(current.uid);
    setAuthError(null);
    setAuthDiagnosis(null);
    await applyUserSessionEvaluation(
      current,
      requestId,
      true,
      'تم التحقق من الصلاحيات وتحديث الجلسة بنجاح'
    );
  }

  async function handleCopyUid(uid: string) {
    try {
      await navigator.clipboard.writeText(uid);
      showToast('تم نسخ معرف UID بنجاح');
    } catch {
      showToast('تعذر النسخ التلقائي — يمكنك تحديد UID ونسخه يدوياً.', true);
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#142A43] via-[#173A59] to-[#167D83] p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#142A43] text-sm font-extrabold text-[#F4EBDD] shadow-sm">
              مداد
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#142A43]">لوحة تحكم منصة مداد التعليمية</h1>
              <p className="text-xs text-slate-500">طريقك نحو التفوق — دخول المشرفين والأساتذة المخوّلين فقط</p>
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
              <p className="font-semibold leading-relaxed">{authError}</p>
              {firebaseUser && (
                <div className="mt-2.5 space-y-2 rounded-xl border border-rose-200 bg-white/85 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="select-all truncate font-mono text-[11px] text-rose-900" dir="ltr">
                      UID: {firebaseUser.uid}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyUid(firebaseUser.uid)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                    >
                      <Copy className="h-3 w-3" />
                      نسخ UID
                    </button>
                  </div>

                  {authDiagnosis && (
                    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                      <p className="font-bold text-slate-900">
                        تشخيص الصلاحية (Firebase Client SDK — لحسابك فقط):
                      </p>
                      <div className="space-y-1">
                        <p>
                          <span className="font-semibold">Custom Claim (abkRole): </span>
                          {authDiagnosis.claimCheck.validRole
                            ? `صالح (${authDiagnosis.claimCheck.validRole})`
                            : authDiagnosis.claimCheck.rawRole
                              ? `غير صالح (${authDiagnosis.claimCheck.rawRole})`
                              : authDiagnosis.adminDocCheck.status === 'SKIPPED_BACKEND_ERROR'
                                ? 'لم يُعتمد (توقف التحقق عند الخادم)'
                                : 'غير مضبوط'}
                        </p>
                        <p>
                          <span className="font-semibold">وثيقة admins/{'{uid}'}: </span>
                          {authDiagnosis.adminDocCheck.status === 'NOT_FOUND'
                            ? 'الوثيقة غير موجودة'
                            : authDiagnosis.adminDocCheck.status === 'ACTIVE_NOT_TRUE'
                              ? `active ليست true (${String(authDiagnosis.adminDocCheck.activeValue ?? 'مفقود')})`
                              : authDiagnosis.adminDocCheck.status === 'UID_MISMATCH'
                                ? 'الحقل uid مفقود أو لا يطابق معرف الحساب الحالي'
                                : authDiagnosis.adminDocCheck.status === 'INVALID_ROLE'
                                  ? `الدور غير صالح (${authDiagnosis.adminDocCheck.rawRoleDisplay || authDiagnosis.adminDocCheck.rawRole || 'مفقود'})`
                                  : authDiagnosis.adminDocCheck.status === 'READ_ERROR'
                                    ? `خطأ قراءة (${authDiagnosis.adminDocCheck.errorKind} / ${authDiagnosis.adminDocCheck.errorCode})`
                                    : authDiagnosis.adminDocCheck.status === 'SKIPPED_BACKEND_ERROR'
                                      ? 'لم يُستخدم لتجاوز قرار الخادم'
                                      : `نشطة (${authDiagnosis.adminDocCheck.validRole})`}
                        </p>
                        <p>
                          <span className="font-semibold">توافق Claim مع Firestore: </span>
                          {authDiagnosis.conflictCheck.hasConflict ? 'يوجد تعارض' : 'لا يوجد تعارض'}
                        </p>
                      </div>
                      <ul className="list-disc space-y-0.5 pr-4 text-[10.5px] text-slate-600">
                        {authDiagnosis.findings.map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-slate-500">
                        تم الفحص عبر Client SDK وفق قواعد Firestore الحالية على حسابك فقط دون قراءة قائمة المسؤولين أو بيانات أي طلاب.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleRefreshAuthCheck()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    إعادة فحص الصلاحية (تحديث التوكن)
                  </button>
                </div>
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
        return (
          <MediaLibrarySection
            store={store}
            staff={staff!}
            canEdit={canEditLessonsAndContent}
            canHardDelete={canHardDelete}
            onToast={showToast}
          />
        );
      case 'students':
        return (
          <StudentsSection
            store={store}
            staff={staff!}
            onRequireReauth={() => setShowReauthModal(true)}
            onToast={showToast}
          />
        );
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
      {staff.warnings && staff.warnings.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900">
          <div className="mb-1 flex items-center gap-1.5 font-bold">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            تنبيه تنسيق في وثيقة الصلاحيات (Firestore)
          </div>
          <ul className="list-disc space-y-1 pr-4">
            {staff.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

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
