import React, { useState } from 'react';
import { CheckCircle2, Plus, ShieldAlert, ShieldCheck, UserX } from 'lucide-react';
import {
  ApiError,
  grantStaffRoleViaBackend,
  revokeStaffRoleViaBackend,
  updateUserStatusViaBackend,
} from '../api';
import { EmptyBox, SectionHeader } from '../components/CommonUi';
import { recordAudit, type CmsStore } from '../services/firestoreCms';
import { ROLE_LABELS, type StaffRole, type StaffSession, type UserProfile } from '../types';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { firestoreDb } from '../firebase';

export function StudentsSection({
  store,
  staff,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const canManageUsers = staff.role === 'SUPER_ADMIN' || staff.role === 'ADMIN';

  const students = store.users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.userId.toLowerCase().includes(q)
    );
  });

  async function toggleStatus(user: UserProfile) {
    const nextStatus = user.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      if (staff.backendOnline) {
        await updateUserStatusViaBackend(user.userId, nextStatus);
      } else {
        await updateDoc(doc(firestoreDb, 'users', user.userId), {
          accountStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });
        await recordAudit(staff, 'USER_STATUS', 'UserProfile', user.userId, `تغيير حالة ${user.email} إلى ${nextStatus}`);
      }
      onToast(nextStatus === 'SUSPENDED' ? 'تم تعطيل حساب الطالب' : 'تم تفعيل حساب الطالب');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'تعذر تحديث الحالة', true);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="إدارة حسابات الطلاب"
        subtitle="البحث في الحسابات النشطة والمعطلة ومراقبة أدوار المستخدمين."
      />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث بالاسم أو البريد الإلكتروني أو المعرف..."
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-2xs focus:border-sky-500 focus:outline-none"
      />

      {students.length === 0 ? (
        <EmptyBox title="لا توجد حسابات مطابقة" subtitle="يظهر الطلاب هنا تلقائياً عند تسجيل الدخول لأول مرة في تطبيق Android." />
      ) : (
        <div className="space-y-2.5">
          {students.map((u) => {
            const suspended = u.accountStatus === 'SUSPENDED';
            const isSelf = u.userId === staff.uid;
            return (
              <div key={u.userId} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  {u.photoUrl ? (
                    <img src={u.photoUrl} alt={u.displayName} className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 font-bold text-[#0F294A]">
                      {u.displayName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[#0F294A]">{u.displayName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${suspended ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {suspended ? 'معطل' : 'نشط'}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{u.role}</span>
                    </div>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                {canManageUsers && !isSelf && (
                  <button
                    type="button"
                    onClick={() => toggleStatus(u)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                      suspended
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {suspended ? <CheckCircle2 className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                    {suspended ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                  </button>
                )}
              </div>
            );
          })}
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
