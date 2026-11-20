import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
  X,
} from 'lucide-react';
import {
  ApiError,
  deleteUserViaBackend,
  fetchUsersViaBackend,
  grantStaffRoleViaBackend,
  revokeStaffRoleViaBackend,
  updateUserStatusViaBackend,
} from '../api';
import { EmptyBox, SectionHeader } from '../components/CommonUi';
import { recordAudit, type CmsStore } from '../services/firestoreCms';
import {
  ROLE_LABELS,
  type AuthUserRecord,
  type StaffRole,
  type StaffSession,
  type UserAccountStatus,
} from '../types';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { firestoreDb } from '../firebase';

type StatusFilter = 'ALL' | UserAccountStatus;
type SortKey = 'lastSignIn' | 'createdAt' | 'name';

function formatIsoDate(iso?: string | null): string {
  if (!iso) return 'غير مسجل';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ar-SY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeProps(status: UserAccountStatus) {
  switch (status) {
    case 'BANNED':
      return { label: 'محظور نهائياً', cls: 'bg-rose-600 text-white' };
    case 'SUSPENDED':
      return { label: 'معطل مؤقتاً', cls: 'bg-amber-100 text-amber-800' };
    default:
      return { label: 'نشط', cls: 'bg-emerald-100 text-emerald-700' };
  }
}

export function StudentsSection({
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
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('lastSignIn');

  const [authUsers, setAuthUsers] = useState<AuthUserRecord[]>([]);
  const [loadingAuthUsers, setLoadingAuthUsers] = useState(false);

  const [selectedUser, setSelectedUser] = useState<AuthUserRecord | null>(null);
  const [banModalUser, setBanModalUser] = useState<AuthUserRecord | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');
  const [deleteModalUser, setDeleteModalUser] = useState<AuthUserRecord | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const canManageUsers = staff.role === 'SUPER_ADMIN' || staff.role === 'ADMIN';

  const loadUsersFromBackend = useCallback(async () => {
    if (!staff.backendOnline) return;
    setLoadingAuthUsers(true);
    try {
      const list = await fetchUsersViaBackend();
      setAuthUsers(list);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'تعذر جلب حسابات Firebase Auth', true);
    } finally {
      setLoadingAuthUsers(false);
    }
  }, [staff.backendOnline, onToast]);

  useEffect(() => {
    void loadUsersFromBackend();
  }, [loadUsersFromBackend]);

  // Merge Firebase Auth list (if backend is online) or fall back cleanly to Firestore profiles
  const mergedUsers: AuthUserRecord[] = useMemo(() => {
    if (staff.backendOnline && authUsers.length > 0) {
      return authUsers.map((au) => {
        const fsUser = store.users.find((u) => u.userId === au.uid);
        return {
          ...au,
          accountStatus: fsUser?.accountStatus || au.accountStatus || (au.disabled ? 'SUSPENDED' : 'ACTIVE'),
          banReason: fsUser?.banReason ?? au.banReason ?? null,
          role: fsUser?.role || au.role || 'STUDENT',
          hasFirestoreProfile: Boolean(fsUser) || au.hasFirestoreProfile,
        };
      });
    }

    return store.users.map((u) => ({
      uid: u.userId,
      email: u.email,
      displayName: u.displayName || 'طالب ABK',
      photoUrl: u.photoUrl || null,
      disabled: u.accountStatus === 'SUSPENDED' || u.accountStatus === 'BANNED',
      emailVerified: true,
      creationTime: null,
      lastSignInTime: null,
      providerIds: ['google.com'],
      role: u.role || 'STUDENT',
      accountStatus: (u.accountStatus as UserAccountStatus) || 'ACTIVE',
      banReason: u.banReason || null,
      bannedBy: u.bannedBy || null,
      hasFirestoreProfile: true,
      authPresent: false,
    }));
  }, [staff.backendOnline, authUsers, store.users]);

  const counts = useMemo(
    () => ({
      all: mergedUsers.length,
      active: mergedUsers.filter((u) => u.accountStatus === 'ACTIVE').length,
      suspended: mergedUsers.filter((u) => u.accountStatus === 'SUSPENDED').length,
      banned: mergedUsers.filter((u) => u.accountStatus === 'BANNED').length,
    }),
    [mergedUsers]
  );

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mergedUsers
      .filter((u) => (statusFilter === 'ALL' ? true : u.accountStatus === statusFilter))
      .filter((u) => {
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.displayName.localeCompare(b.displayName, 'ar');
        }
        if (sortBy === 'createdAt') {
          return Date.parse(b.creationTime || '') - Date.parse(a.creationTime || '');
        }
        return Date.parse(b.lastSignInTime || '') - Date.parse(a.lastSignInTime || '');
      });
  }, [mergedUsers, statusFilter, query, sortBy]);

  async function applyStatusChange(user: AuthUserRecord, nextStatus: UserAccountStatus, reason?: string) {
    setBusyUid(user.uid);
    try {
      if (staff.backendOnline) {
        await updateUserStatusViaBackend(user.uid, nextStatus, reason);
        await loadUsersFromBackend();
      } else {
        const updatePayload: Record<string, unknown> = {
          accountStatus: nextStatus,
          updatedAt: serverTimestamp(),
        };
        if (nextStatus === 'BANNED') {
          updatePayload.banReason = reason?.trim() || 'مخالفة سياسة الاستخدام';
          updatePayload.bannedAt = serverTimestamp();
          updatePayload.bannedBy = staff.email || staff.uid;
        } else if (nextStatus === 'ACTIVE') {
          updatePayload.banReason = deleteField();
          updatePayload.bannedAt = deleteField();
          updatePayload.bannedBy = deleteField();
        }
        await updateDoc(doc(firestoreDb, 'users', user.uid), updatePayload);
        await recordAudit(
          staff,
          nextStatus === 'BANNED' ? 'BAN_USER' : nextStatus === 'SUSPENDED' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
          'UserProfile',
          user.uid,
          `تغيير حالة ${user.email} إلى ${nextStatus}${reason ? ` — ${reason}` : ''}`
        );
      }

      if (selectedUser?.uid === user.uid) {
        setSelectedUser((prev) =>
          prev
            ? {
                ...prev,
                accountStatus: nextStatus,
                disabled: nextStatus !== 'ACTIVE',
                banReason: nextStatus === 'BANNED' ? reason?.trim() || 'مخالفة سياسة الاستخدام' : null,
              }
            : null
        );
      }

      const msgMap: Record<UserAccountStatus, string> = {
        ACTIVE: 'تم تفعيل الحساب ورفع التقييد بنجاح',
        SUSPENDED: 'تم تعطيل الحساب مؤقتاً وإبطال جلساته',
        BANNED: 'تم حظر الحساب نهائياً ومنع وصوله للتطبيق',
      };
      onToast(msgMap[nextStatus]);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'تعذر تحديث حالة الحساب', true);
    } finally {
      setBusyUid(null);
    }
  }

  async function handleConfirmBan(e: React.FormEvent) {
    e.preventDefault();
    if (!banModalUser) return;
    const target = banModalUser;
    const reason = banReasonInput.trim();
    setBanModalUser(null);
    setBanReasonInput('');
    await applyStatusChange(target, 'BANNED', reason);
  }

  async function handleConfirmDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteModalUser) return;
    if (!staff.backendOnline) {
      onToast('حذف حساب Firebase Auth بالكامل يتطلب تشغيل الخادم الموثوق (server).', true);
      return;
    }
    setBusyUid(deleteModalUser.uid);
    try {
      const res = await deleteUserViaBackend(deleteModalUser.uid, deleteConfirmInput.trim());
      setDeleteModalUser(null);
      setDeleteConfirmInput('');
      if (selectedUser?.uid === deleteModalUser.uid) {
        setSelectedUser(null);
      }
      await loadUsersFromBackend();
      onToast(`تم حذف الحساب نهائياً (${res.deletedDocsCount} سجل مرفق)`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 428) {
        onRequireReauth();
      }
      onToast(err instanceof Error ? err.message : 'فشل الحذف النهائي للحساب', true);
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="إدارة حسابات الطلاب والمستخدمين"
        subtitle={
          staff.backendOnline
            ? 'عرض موحد لجميع حسابات Firebase Authentication وملفات Firestore مع إجراءات التفعيل والتعطيل والحظر والحذف.'
            : 'عرض ملفات Firestore — فعّل الخادم الموثوق لجلب كافة حسابات Firebase Auth وتنفيذ الحذف النهائي.'
        }
        action={
          staff.backendOnline && (
            <button
              type="button"
              onClick={() => void loadUsersFromBackend()}
              disabled={loadingAuthUsers}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-[#0F294A] hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingAuthUsers ? 'animate-spin' : ''}`} />
              تحديث من Firebase Auth
            </button>
          )
        }
      />

      {/* Filter pills & Sort bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL' as StatusFilter, label: `الكل (${counts.all})` },
            { id: 'ACTIVE' as StatusFilter, label: `نشط (${counts.active})` },
            { id: 'SUSPENDED' as StatusFilter, label: `معطل (${counts.suspended})` },
            { id: 'BANNED' as StatusFilter, label: `محظور (${counts.banned})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === tab.id
                  ? 'bg-[#0F294A] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-lg">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم أو البريد أو UID..."
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs focus:border-sky-500 focus:outline-none"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
          >
            <option value="lastSignIn">الأحدث دخولاً</option>
            <option value="createdAt">الأحدث تسجيلاً</option>
            <option value="name">حسب الاسم</option>
          </select>
        </div>
      </div>

      {visibleUsers.length === 0 ? (
        <EmptyBox
          title="لا توجد حسابات مطابقة"
          subtitle="جرّب تغيير الفلتر أو البحث بجزء من البريد الإلكتروني أو المعرف UID."
        />
      ) : (
        <div className="space-y-2.5">
          {visibleUsers.map((u) => {
            const badge = statusBadgeProps(u.accountStatus);
            const isSelf = u.uid === staff.uid;
            const isSuperEmail = u.email.trim().toLowerCase() === 'karimaeti07@gmail.com';
            const locked = isSelf || isSuperEmail || busyUid === u.uid;

            return (
              <div
                key={u.uid}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs lg:flex-row lg:items-center"
              >
                <div className="flex items-start gap-3">
                  {u.photoUrl ? (
                    <img
                      src={u.photoUrl}
                      alt={u.displayName}
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[#0F294A]">
                      {(u.displayName || u.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[#0F294A]">{u.displayName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {u.role}
                      </span>
                      {!u.hasFirestoreProfile && (
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          Auth فقط
                        </span>
                      )}
                    </div>
                    <p dir="ltr" className="truncate text-left text-xs text-slate-500">
                      {u.email || u.uid}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      آخر دخول: {formatIsoDate(u.lastSignInTime)}
                      {u.banReason ? ` • سبب الحظر: ${u.banReason}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    التفاصيل
                  </button>

                  {canManageUsers && !locked && (
                    <>
                      {u.accountStatus !== 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => void applyStatusChange(u, 'ACTIVE')}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {u.accountStatus === 'BANNED' ? 'رفع الحظر' : 'تفعيل'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void applyStatusChange(u, 'SUSPENDED')}
                          className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          تعطيل مؤقت
                        </button>
                      )}

                      {u.accountStatus !== 'BANNED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setBanModalUser(u);
                            setBanReasonInput('');
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          حظر
                        </button>
                      )}

                      {staff.backendOnline && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteModalUser(u);
                            setDeleteConfirmInput('');
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                          title="حذف نهائي للحساب"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          حذف
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* User Detail Drawer / Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                {selectedUser.photoUrl ? (
                  <img
                    src={selectedUser.photoUrl}
                    alt={selectedUser.displayName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 font-bold text-[#0F294A]">
                    {selectedUser.displayName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-[#0F294A]">{selectedUser.displayName}</h3>
                  <p dir="ltr" className="text-left text-xs text-slate-500">{selectedUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-slate-400">معرف المستخدم (UID)</dt>
                <dd dir="ltr" className="mt-0.5 select-all font-mono text-left text-[11px] font-bold text-[#0F294A]">
                  {selectedUser.uid}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-400">الحالة</dt>
                <dd className="mt-0.5 font-bold text-[#0F294A]">
                  {statusBadgeProps(selectedUser.accountStatus).label}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-400">الدور</dt>
                <dd className="mt-0.5 font-bold text-[#0F294A]">{selectedUser.role}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-400">تاريخ الإنشاء</dt>
                <dd className="mt-0.5 font-semibold text-slate-700">{formatIsoDate(selectedUser.creationTime)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-400">آخر تسجيل دخول</dt>
                <dd className="mt-0.5 font-semibold text-slate-700">{formatIsoDate(selectedUser.lastSignInTime)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-400">المزود</dt>
                <dd dir="ltr" className="mt-0.5 text-left font-semibold text-slate-700">
                  {selectedUser.providerIds.join(', ') || 'google.com'}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-400">تعطيل Firebase Auth</dt>
                <dd className="mt-0.5 font-semibold text-slate-700">
                  {selectedUser.disabled ? 'معطل (Disabled)' : 'مسموح بالدخول'}
                </dd>
              </div>
              {selectedUser.banReason && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 sm:col-span-2">
                  <dt className="font-bold text-rose-800">سبب الحظر الإداري</dt>
                  <dd className="mt-0.5 text-rose-700">{selectedUser.banReason}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4">
              <p className="mb-2 text-xs font-bold text-[#0F294A]">آخر العمليات المرتبطة بهذا الحساب</p>
              <div className="max-h-36 space-y-1.5 overflow-y-auto">
                {store.auditLogs
                  .filter((l) => l.entityId === selectedUser.uid)
                  .slice(0, 6)
                  .map((log) => (
                    <div key={log.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                      <span className="font-bold">{log.action}</span> — {log.summary}
                    </div>
                  ))}
                {store.auditLogs.filter((l) => l.entityId === selectedUser.uid).length === 0 && (
                  <p className="text-[11px] text-slate-400">لا توجد أحداث إدارية مسجلة لهذا المستخدم بعد.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban User Modal */}
      {banModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleConfirmBan} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-rose-700">حظر الحساب نهائياً</h3>
            <p className="text-xs text-slate-600">
              سيتم منع المستخدم <strong>{banModalUser.email || banModalUser.uid}</strong> من الوصول إلى المحتوى وإبطال جميع جلساته النشطة.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">سبب الحظر (يظهر للطالب والإدارة)</label>
              <textarea
                rows={3}
                maxLength={300}
                value={banReasonInput}
                onChange={(e) => setBanReasonInput(e.target.value)}
                placeholder="مثال: مشاركة الحساب أو مخالفة شروط المنصة..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBanModalUser(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                تأكيد الحظر النهائي
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Hard Delete User Confirmation Modal */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleConfirmDelete} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-rose-700">حذف الحساب نهائياً من Firebase Auth وFirestore</h3>
            <p className="text-xs leading-relaxed text-slate-600">
              هذا الإجراء لا يمكن التراجع عنه وسيحذف بيانات الطالب من Auth وFirestore. للتأكيد اكتب البريد الإلكتروني أو المعرف أدناه:
            </p>
            <div dir="ltr" className="select-all rounded-xl bg-slate-100 px-3 py-2 text-left font-mono text-xs font-bold text-[#0F294A]">
              {deleteModalUser.email || deleteModalUser.uid}
            </div>
            <input
              required
              dir="ltr"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={deleteModalUser.email || deleteModalUser.uid}
              className="w-full rounded-xl border border-rose-300 px-3 py-2 text-left text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={
                  !deleteConfirmInput.trim() ||
                  (deleteConfirmInput.trim().toLowerCase() !== (deleteModalUser.email || '').toLowerCase() &&
                    deleteConfirmInput.trim() !== deleteModalUser.uid)
                }
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                حذف الحساب نهائياً
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function AdminsRbacSection({
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
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('CONTENT_MANAGER');
  const [teacherId, setTeacherId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSuper = staff.role === 'SUPER_ADMIN';

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      if (!staff.backendOnline) {
        onToast('تعيين Custom Claims يتطلب تشغيل الخادم الموثوق (server/index.js).', true);
        return;
      }
      await grantStaffRoleViaBackend({
        email: email.trim(),
        role,
        teacherId: teacherId || undefined,
        active: true,
      });
      setEmail('');
      onToast(`تم منح دور ${ROLE_LABELS[role]} وتحديث Custom Claims بنجاح`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 428) {
        onRequireReauth();
      }
      onToast(err instanceof Error ? err.message : 'فشل تحديث الصلاحيات', true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(uid: string) {
    try {
      if (!staff.backendOnline) {
        onToast('يتطلب تشغيل الخادم الموثوق.', true);
        return;
      }
      await revokeStaffRoleViaBackend(uid);
      onToast('تم سحب الصلاحيات الإدارية وإعادة الحساب إلى طالب');
    } catch (err) {
      if (err instanceof ApiError && err.status === 428) {
        onRequireReauth();
      }
      onToast(err instanceof Error ? err.message : 'فشل سحب الصلاحية', true);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="إدارة المشرفين والصلاحيات (RBAC + Custom Claims)"
        subtitle="إضافة وتعديل أدوار فريق الإدارة عبر الخادم الموثوق باستخدام Firebase Admin SDK."
      />

      {!staff.backendOnline && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">الخادم الخلفي الموثوق (server) غير متصل حالياً</p>
            <p className="mt-1">
              لحفظ Custom Claims بشكل آمن ومنع أي تلاعب من المتصفح، يتم تعديل أدوار المشرفين عبر خادم{' '}
              <code dir="ltr">admin-portal/server</code> مع مفتاح Service Account في متغيرات البيئة.
            </p>
          </div>
        </div>
      )}

      {isSuper && (
        <form onSubmit={handleGrant} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-[#0F294A]">منح صلاحية مشرف أو أستاذ أو مدير محتوى</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@gmail.com"
              className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="CONTENT_MANAGER">{ROLE_LABELS.CONTENT_MANAGER}</option>
              <option value="TEACHER">{ROLE_LABELS.TEACHER}</option>
              <option value="VIEWER">{ROLE_LABELS.VIEWER}</option>
              <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
              <option value="SUPER_ADMIN">{ROLE_LABELS.SUPER_ADMIN}</option>
            </select>
            {role === 'TEACHER' ? (
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">ربط بملف أستاذ (اختياري)</option>
                {store.teachers
                  .filter((t) => !t.deletedAt)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                {submitting ? 'جاري التعيين...' : 'منح الصلاحية'}
              </button>
            )}
          </div>
          {role === 'TEACHER' && (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              منح صلاحية الأستاذ
            </button>
          )}
        </form>
      )}

      <div className="space-y-2.5">
        {store.admins.map((adm) => (
          <div key={adm.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#0F294A]">{adm.displayName || adm.email}</span>
                  <span className="rounded-full bg-[#0F294A] px-2.5 py-0.5 text-[11px] font-bold text-white">
                    {ROLE_LABELS[adm.role || 'ADMIN']}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {adm.email} • مُنح بواسطة: {adm.grantedBy}
                </p>
              </div>
            </div>
            {isSuper && adm.uid !== staff.uid && adm.email.toLowerCase() !== 'karimaeti07@gmail.com' && (
              <button
                type="button"
                onClick={() => handleRevoke(adm.uid)}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                سحب الصلاحية
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
