import type { AdminEntry, StaffRole, StaffSession } from '../types';

export const VALID_STAFF_ROLES = new Set<StaffRole>([
  'SUPER_ADMIN',
  'ADMIN',
  'CONTENT_MANAGER',
  'TEACHER',
  'VIEWER',
]);

const INVISIBLE_FORMAT_CHARS_RE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export function normalizeIdentifierValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(INVISIBLE_FORMAT_CHARS_RE, '').trim();
}

export function normalizeStaffRole(value: unknown): StaffRole | null {
  const cleaned = normalizeIdentifierValue(value);
  return VALID_STAFF_ROLES.has(cleaned as StaffRole) ? (cleaned as StaffRole) : null;
}

export function formatRawValueForDiagnostics(value: string): string {
  return Array.from(value)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === ' ') return '·';
      if (ch === '\u00A0') return '[NBSP]';
      if (ch === '\t') return '\\t';
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2060 && code <= 0x2069) ||
        code === 0x00ad ||
        code === 0x061c ||
        code === 0xfeff ||
        code < 0x20 ||
        code > 0x7e
      ) {
        return `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`;
      }
      return ch;
    })
    .join('');
}

export interface FrontendStaffRoleResult {
  role: StaffRole;
  permissions: string[];
  teacherId: string | null;
}

export function resolveFrontendStaffRole({
  uid,
  claims,
  adminDoc,
}: {
  uid?: string;
  claims: Record<string, unknown> | null | undefined;
  adminDoc: Partial<AdminEntry> | null | undefined;
}): FrontendStaffRoleResult | null {
  if (adminDoc && adminDoc.active === false) {
    throw new Error('تم تعطيل صلاحية هذا الحساب الإداري.');
  }

  const validClaimRole = normalizeStaffRole(claims?.abkRole) ?? undefined;

  let adminDocRole: StaffRole | undefined;
  let adminPermissions: string[] = [];
  let docTeacherId: string | null = null;

  // Enforce strict active === true, matching UID (when uid is provided), and explicit role within VALID_STAFF_ROLES
  if (adminDoc && adminDoc.active === true) {
    const cleanExpectedUid = normalizeIdentifierValue(uid);
    const cleanDocUid = normalizeIdentifierValue(adminDoc.uid);
    const uidValid = cleanExpectedUid
      ? cleanDocUid === cleanExpectedUid
      : adminDoc.uid === undefined || cleanDocUid.length > 0;

    const validDocRole = normalizeStaffRole(adminDoc.role);
    if (uidValid && validDocRole) {
      adminDocRole = validDocRole;
      adminPermissions = Array.isArray(adminDoc.permissions)
        ? adminDoc.permissions.filter((p): p is string => typeof p === 'string')
        : [];
      docTeacherId =
        typeof adminDoc.teacherId === 'string' && adminDoc.teacherId ? adminDoc.teacherId : null;
    }
  }

  const resolvedRole: StaffRole | null = validClaimRole || adminDocRole || null;
  if (!resolvedRole) {
    return null;
  }

  const claimPermissions = Array.isArray(claims?.abkPermissions)
    ? (claims.abkPermissions as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  const claimTeacherId =
    typeof claims?.teacherId === 'string' && claims.teacherId ? claims.teacherId : null;

  return {
    role: resolvedRole,
    permissions: adminPermissions.length > 0 ? adminPermissions : claimPermissions,
    teacherId: docTeacherId || claimTeacherId,
  };
}

export type AdminDocDiagnosticStatus =
  | 'VALID_ACTIVE'
  | 'NOT_FOUND'
  | 'ACTIVE_NOT_TRUE'
  | 'UID_MISMATCH'
  | 'INVALID_ROLE'
  | 'READ_ERROR'
  | 'SKIPPED_BACKEND_ERROR';

export type AdminReadErrorKind =
  | 'PERMISSION_DENIED'
  | 'UNAVAILABLE_OR_NETWORK'
  | 'DATABASE_OR_CONFIG'
  | 'UNKNOWN';

export type AccessDenialReasonCode =
  | 'ALLOWED'
  | 'ADMIN_DISABLED'
  | 'ADMIN_DOC_MISSING'
  | 'ADMIN_DOC_INACTIVE'
  | 'ADMIN_DOC_UID_MISMATCH'
  | 'ADMIN_DOC_INVALID_ROLE'
  | 'CLAIM_DOC_CONFLICT'
  | 'FIRESTORE_PERMISSION_ERROR'
  | 'FIRESTORE_NETWORK_ERROR'
  | 'FIRESTORE_DATABASE_ERROR'
  | 'FIRESTORE_UNKNOWN_ERROR'
  | 'BACKEND_FORBIDDEN'
  | 'BACKEND_UNAUTHENTICATED'
  | 'BACKEND_SERVER_ERROR';

export interface ClientAdminAccessDiagnosis {
  allowed: boolean;
  resolvedRole: StaffRole | null;
  primaryReasonCode: AccessDenialReasonCode;
  primaryMessage: string;
  claimCheck: {
    rawRole: string | null;
    validRole: StaffRole | null;
    present: boolean;
    valid: boolean;
    summary: string;
  };
  adminDocCheck: {
    status: AdminDocDiagnosticStatus;
    exists: boolean;
    activeValue: unknown;
    activeIsTrue: boolean;
    rawRole: string | null;
    rawRoleDisplay: string | null;
    validRole: StaffRole | null;
    uidMatches: boolean | null;
    hasRoleFormattingArtifacts: boolean;
    hasUidFormattingArtifacts: boolean;
    errorKind: AdminReadErrorKind | null;
    errorCode: string | null;
    errorMessage: string | null;
    summary: string;
  };
  conflictCheck: {
    hasConflict: boolean;
    conflictType:
      | 'NONE'
      | 'ROLE_MISMATCH'
      | 'CLAIM_WITHOUT_ACTIVE_DOC'
      | 'DOC_WITHOUT_VALID_CLAIM';
    summary: string;
  };
  findings: string[];
  warnings: string[];
}

export interface OwnAdminDocSnapshotLike {
  exists: () => boolean;
  data: () => Partial<AdminEntry> | undefined;
}

export interface IdTokenResultLike {
  claims: Record<string, unknown>;
}

export function classifyFirestoreAdminReadError(err: unknown): {
  kind: AdminReadErrorKind;
  code: string;
  message: string;
  summary: string;
} {
  const rawCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const normalizedCode = rawCode.replace(/^firestore\//i, '').trim().toLowerCase();
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message || '')
        : String(err || '');

  if (normalizedCode === 'permission-denied' || normalizedCode === 'unauthenticated') {
    return {
      kind: 'PERMISSION_DENIED',
      code: normalizedCode,
      message,
      summary: `خطأ صلاحيات عند قراءة وثيقة admins/{uid} (${normalizedCode}): تحقق من قواعد Firestore أو App Check أو حالة تسجيل الدخول.`,
    };
  }

  if (
    normalizedCode === 'unavailable' ||
    normalizedCode === 'deadline-exceeded' ||
    normalizedCode === 'aborted' ||
    normalizedCode === 'cancelled' ||
    /network|offline|failed to fetch|timed out|timeout/i.test(message)
  ) {
    const label = normalizedCode || 'network';
    return {
      kind: 'UNAVAILABLE_OR_NETWORK',
      code: label,
      message,
      summary: `خطأ اتصال بالشبكة أو تعذر الوصول إلى خادم Firestore (${label}).`,
    };
  }

  if (
    normalizedCode === 'not-found' ||
    normalizedCode === 'failed-precondition' ||
    normalizedCode === 'invalid-argument' ||
    normalizedCode === 'internal' ||
    normalizedCode === 'data-loss' ||
    normalizedCode === 'resource-exhausted' ||
    normalizedCode === 'unimplemented'
  ) {
    return {
      kind: 'DATABASE_OR_CONFIG',
      code: normalizedCode,
      message,
      summary: `خطأ في قاعدة بيانات Firestore المسماة أو إعداداتها (${normalizedCode}).`,
    };
  }

  return {
    kind: 'UNKNOWN',
    code: normalizedCode || 'unknown',
    message,
    summary: normalizedCode
      ? `تعذر قراءة وثيقة admins/{uid} (${normalizedCode}).`
      : 'تعذر قراءة وثيقة admins/{uid} بسبب خطأ غير متوقع.',
  };
}

export function diagnoseClientAdminAccess({
  uid,
  claims,
  adminDocExists,
  adminDoc,
  adminDocError,
  backendErrorMessage,
}: {
  uid: string;
  claims: Record<string, unknown> | null | undefined;
  adminDocExists: boolean;
  adminDoc: Partial<AdminEntry> | null | undefined;
  adminDocError?: unknown;
  backendErrorMessage?: string | null;
}): ClientAdminAccessDiagnosis {
  const rawClaimRole =
    typeof claims?.abkRole === 'string' && claims.abkRole.length > 0 ? claims.abkRole : null;
  const validClaimRole = normalizeStaffRole(rawClaimRole);

  const claimCheck = {
    rawRole: rawClaimRole,
    validRole: validClaimRole,
    present: Boolean(rawClaimRole),
    valid: Boolean(validClaimRole),
    summary: validClaimRole
      ? `Custom Claim (abkRole) مضبوط وصالح: ${validClaimRole}.`
      : rawClaimRole
        ? `قيمة Custom Claim (abkRole) غير صالحة (${formatRawValueForDiagnostics(rawClaimRole)}).`
        : 'Custom Claim (abkRole) غير مضبوط في التوكن الحالي.',
  };

  let adminDocCheck: ClientAdminAccessDiagnosis['adminDocCheck'];

  if (adminDocError) {
    const classified = classifyFirestoreAdminReadError(adminDocError);
    adminDocCheck = {
      status: 'READ_ERROR',
      exists: false,
      activeValue: undefined,
      activeIsTrue: false,
      rawRole: null,
      rawRoleDisplay: null,
      validRole: null,
      uidMatches: null,
      hasRoleFormattingArtifacts: false,
      hasUidFormattingArtifacts: false,
      errorKind: classified.kind,
      errorCode: classified.code,
      errorMessage: classified.message || null,
      summary: classified.summary,
    };
  } else if (!adminDocExists || !adminDoc) {
    adminDocCheck = {
      status: 'NOT_FOUND',
      exists: false,
      activeValue: undefined,
      activeIsTrue: false,
      rawRole: null,
      rawRoleDisplay: null,
      validRole: null,
      uidMatches: null,
      hasRoleFormattingArtifacts: false,
      hasUidFormattingArtifacts: false,
      errorKind: null,
      errorCode: null,
      errorMessage: null,
      summary: 'وثيقة admins/{uid} غير موجودة في قاعدة البيانات المسماة.',
    };
  } else {
    const rawDocRole =
      typeof adminDoc.role === 'string' && adminDoc.role.length > 0 ? adminDoc.role : null;
    const validDocRole = normalizeStaffRole(rawDocRole);
    const hasRoleFormattingArtifacts = Boolean(rawDocRole && validDocRole && rawDocRole !== validDocRole);
    const rawRoleDisplay = rawDocRole ? formatRawValueForDiagnostics(rawDocRole) : null;
    const activeIsTrue = adminDoc.active === true;
    const cleanDocUid = normalizeIdentifierValue(adminDoc.uid);
    const uidMatches = cleanDocUid.length > 0 ? cleanDocUid === uid : false;
    const hasUidFormattingArtifacts = Boolean(
      typeof adminDoc.uid === 'string' && uidMatches && adminDoc.uid !== uid
    );

    let status: AdminDocDiagnosticStatus;
    let summary: string;

    if (adminDoc.active === false) {
      status = 'ACTIVE_NOT_TRUE';
      summary = 'الحقل active في وثيقة admins/{uid} يساوي false (الحساب معطّل).';
    } else if (!activeIsTrue) {
      status = 'ACTIVE_NOT_TRUE';
      summary =
        adminDoc.active === undefined
          ? 'الحقل active مفقود في وثيقة admins/{uid} (يجب أن يساوي true).'
          : `قيمة الحقل active في وثيقة admins/{uid} ليست true (${String(adminDoc.active)}).`;
    } else if (!uidMatches) {
      status = 'UID_MISMATCH';
      summary = cleanDocUid
        ? 'الحقل uid داخل وثيقة admins/{uid} لا يطابق معرف الحساب الحالي.'
        : 'الحقل uid مفقود في وثيقة admins/{uid} (يجب أن يطابق معرف الحساب الحالي).';
    } else if (!validDocRole) {
      status = 'INVALID_ROLE';
      summary = rawDocRole
        ? `الدور في وثيقة admins/{uid} غير صالح (${rawRoleDisplay}).`
        : 'حقل الدور (role) مفقود في وثيقة admins/{uid}.';
    } else {
      status = 'VALID_ACTIVE';
      summary = `وثيقة admins/{uid} موجودة ونشطة (active=true) بدور ${validDocRole}.`;
    }

    adminDocCheck = {
      status,
      exists: true,
      activeValue: adminDoc.active,
      activeIsTrue,
      rawRole: rawDocRole,
      rawRoleDisplay,
      validRole: validDocRole,
      uidMatches,
      hasRoleFormattingArtifacts,
      hasUidFormattingArtifacts,
      errorKind: null,
      errorCode: null,
      errorMessage: null,
      summary,
    };
  }

  let conflictCheck: ClientAdminAccessDiagnosis['conflictCheck'];
  const normalizedClaimForCompare = validClaimRole || normalizeIdentifierValue(rawClaimRole) || null;
  const normalizedDocForCompare =
    adminDocCheck.validRole || normalizeIdentifierValue(adminDocCheck.rawRole) || null;

  if (adminDocCheck.status === 'READ_ERROR') {
    conflictCheck = {
      hasConflict: false,
      conflictType: 'NONE',
      summary: 'تعذر فحص التطابق بين Claim وFirestore بسبب تعذر قراءة وثيقة admins/{uid}.',
    };
  } else if (
    normalizedClaimForCompare &&
    normalizedDocForCompare &&
    normalizedClaimForCompare !== normalizedDocForCompare
  ) {
    conflictCheck = {
      hasConflict: true,
      conflictType: 'ROLE_MISMATCH',
      summary: `تعارض بين Custom Claim (abkRole=${normalizedClaimForCompare}) والدور في وثيقة admins/{uid} (${normalizedDocForCompare}).`,
    };
  } else if (validClaimRole && adminDocCheck.status !== 'VALID_ACTIVE') {
    conflictCheck = {
      hasConflict: true,
      conflictType: 'CLAIM_WITHOUT_ACTIVE_DOC',
      summary: `تعارض: يوجد Custom Claim صالح (${validClaimRole}) بينما وثيقة admins/{uid} غير صالحة/غير فعالة (${adminDocCheck.summary})`,
    };
  } else if (!validClaimRole && adminDocCheck.status === 'VALID_ACTIVE') {
    conflictCheck = {
      hasConflict: true,
      conflictType: 'DOC_WITHOUT_VALID_CLAIM',
      summary: `تعارض غير مانع للدخول: وثيقة admins/{uid} نشطة بدور ${adminDocCheck.validRole}، لكن Custom Claim (abkRole) غير مضبوط في التوكن (قواعد Storage فقط تتطلب Claim).`,
    };
  } else {
    conflictCheck = {
      hasConflict: false,
      conflictType: 'NONE',
      summary: validClaimRole
        ? 'متطابق: Custom Claim ووثيقة admins/{uid} متوافقان.'
        : 'لا يوجد تعارض (لا توجد صلاحية في Claim ولا في وثيقة admins/{uid}).',
    };
  }

  let allowed = false;
  let resolvedRole: StaffRole | null = null;
  let primaryReasonCode: AccessDenialReasonCode;
  let primaryMessage: string;
  const effectiveDocRole =
    adminDocCheck.status === 'VALID_ACTIVE' ? adminDocCheck.validRole : null;

  if (backendErrorMessage) {
    primaryReasonCode = 'BACKEND_FORBIDDEN';
    primaryMessage = backendErrorMessage;
  } else if (adminDocExists && adminDoc?.active === false) {
    primaryReasonCode = 'ADMIN_DISABLED';
    primaryMessage = conflictCheck.hasConflict
      ? `تم رفض الدخول: الحساب معطّل في وثيقة admins/{uid} (active=false)، مع وجود تعارض مع Custom Claim (${rawClaimRole}).`
      : 'تم تعطيل صلاحية هذا الحساب الإداري (active=false في وثيقة admins/{uid}).';
  } else if (validClaimRole || effectiveDocRole) {
    allowed = true;
    resolvedRole = validClaimRole || effectiveDocRole;
    primaryReasonCode = 'ALLOWED';
    primaryMessage = `تم التحقق من الصلاحية بنجاح (${resolvedRole}).`;
  } else if (adminDocCheck.status === 'READ_ERROR') {
    if (adminDocCheck.errorKind === 'PERMISSION_DENIED') {
      primaryReasonCode = 'FIRESTORE_PERMISSION_ERROR';
    } else if (adminDocCheck.errorKind === 'UNAVAILABLE_OR_NETWORK') {
      primaryReasonCode = 'FIRESTORE_NETWORK_ERROR';
    } else if (adminDocCheck.errorKind === 'DATABASE_OR_CONFIG') {
      primaryReasonCode = 'FIRESTORE_DATABASE_ERROR';
    } else {
      primaryReasonCode = 'FIRESTORE_UNKNOWN_ERROR';
    }
    primaryMessage = `رفض الدخول: ${adminDocCheck.summary} ولا يوجد Custom Claim (abkRole) صالح.`;
  } else if (conflictCheck.conflictType === 'ROLE_MISMATCH') {
    primaryReasonCode = 'CLAIM_DOC_CONFLICT';
    primaryMessage = `رفض الدخول: ${conflictCheck.summary} ولا يحمل أي منهما دوراً معتمداً وفعالاً.`;
  } else if (adminDocCheck.status === 'NOT_FOUND') {
    primaryReasonCode = 'ADMIN_DOC_MISSING';
    primaryMessage = rawClaimRole
      ? `رفض الدخول: وثيقة admins/{uid} غير موجودة، وقيمة Custom Claim (abkRole=${formatRawValueForDiagnostics(rawClaimRole)}) غير صالحة.`
      : 'رفض الدخول: وثيقة admins/{uid} غير موجودة في قاعدة البيانات، وCustom Claim (abkRole) غير مضبوط في التوكن.';
  } else if (adminDocCheck.status === 'ACTIVE_NOT_TRUE') {
    primaryReasonCode = 'ADMIN_DOC_INACTIVE';
    primaryMessage = `رفض الدخول: ${adminDocCheck.summary} ولا يوجد Custom Claim (abkRole) صالح.`;
  } else if (adminDocCheck.status === 'UID_MISMATCH') {
    primaryReasonCode = 'ADMIN_DOC_UID_MISMATCH';
    primaryMessage = `رفض الدخول: ${adminDocCheck.summary} ولا يوجد Custom Claim (abkRole) صالح.`;
  } else {
    primaryReasonCode = 'ADMIN_DOC_INVALID_ROLE';
    primaryMessage = `رفض الدخول: ${adminDocCheck.summary} ولا يوجد Custom Claim (abkRole) صالح.`;
  }

  const findings: string[] = [claimCheck.summary, adminDocCheck.summary];
  const warnings: string[] = [];

  if (conflictCheck.hasConflict) {
    findings.push(conflictCheck.summary);
  }
  if (adminDocCheck.exists && adminDocCheck.uidMatches === false) {
    findings.push('تنبيه: الحقل uid داخل وثيقة admins/{uid} مفقود أو لا يطابق معرف الحساب الحالي.');
  }
  if (adminDocCheck.hasRoleFormattingArtifacts && adminDocCheck.rawRoleDisplay) {
    const roleWarn = `تنبيه: الحقل role في Firestore يحتوي مسافات أو محارف غير مرئية (${adminDocCheck.rawRoleDisplay}) — أعد كتابة SUPER_ADMIN نظيفاً في Firestore Console لضمان عمل قواعد Firestore بدون Custom Claim.`;
    findings.push(roleWarn);
    if (!validClaimRole) {
      warnings.push(roleWarn);
    }
  }
  if (adminDocCheck.hasUidFormattingArtifacts) {
    const uidWarn =
      'تنبيه: الحقل uid في Firestore يحتوي مسافات أو محارف غير مرئية — أعد كتابة UID نظيفاً في Firestore Console لضمان عمل قواعد Firestore.';
    findings.push(uidWarn);
    if (!validClaimRole) {
      warnings.push(uidWarn);
    }
  }
  if (adminDocCheck.status === 'READ_ERROR' && allowed) {
    findings.push('تنبيه: تم السماح مؤقتاً استناداً إلى Custom Claim (abkRole) الصالح رغم تعذر قراءة وثيقة admins/{uid}.');
  }

  return {
    allowed,
    resolvedRole,
    primaryReasonCode,
    primaryMessage,
    claimCheck,
    adminDocCheck,
    conflictCheck,
    findings,
    warnings,
  };
}

export async function runClientAdminDiagnostic({
  uid,
  readIdTokenResult,
  readOwnAdminDoc,
  backendErrorMessage = null,
}: {
  uid: string;
  readIdTokenResult: () => Promise<IdTokenResultLike>;
  readOwnAdminDoc: (targetUid: string) => Promise<OwnAdminDocSnapshotLike>;
  backendErrorMessage?: string | null;
}): Promise<{
  claims: Record<string, unknown>;
  adminDoc: Partial<AdminEntry> | null;
  diagnosis: ClientAdminAccessDiagnosis;
}> {
  const tokenResult = await readIdTokenResult();
  const claims = (tokenResult?.claims ?? {}) as Record<string, unknown>;

  let adminDocExists = false;
  let adminDoc: Partial<AdminEntry> | null = null;
  let adminDocError: unknown = null;

  try {
    const snap = await readOwnAdminDoc(uid);
    if (snap.exists()) {
      adminDocExists = true;
      adminDoc = (snap.data() ?? null) as Partial<AdminEntry> | null;
    }
  } catch (err) {
    adminDocError = err;
  }

  const diagnosis = diagnoseClientAdminAccess({
    uid,
    claims,
    adminDocExists,
    adminDoc,
    adminDocError,
    backendErrorMessage,
  });

  return { claims, adminDoc, diagnosis };
}

export interface AuthRequestGuard {
  begin(uid: string | null): number;
  invalidate(): number;
  isCurrent(requestId: number, expectedUid: string | null): boolean;
  currentRequestId(): number;
  currentUid(): string | null;
}

export function createAuthRequestGuard(): AuthRequestGuard {
  let latestRequestId = 0;
  let activeUid: string | null = null;

  return {
    begin(uid: string | null) {
      latestRequestId += 1;
      activeUid = uid;
      return latestRequestId;
    },
    invalidate() {
      latestRequestId += 1;
      activeUid = null;
      return latestRequestId;
    },
    isCurrent(requestId: number, expectedUid: string | null) {
      return requestId === latestRequestId && activeUid === expectedUid;
    },
    currentRequestId() {
      return latestRequestId;
    },
    currentUid() {
      return activeUid;
    },
  };
}

export function formatGooglePopupErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').trim().toLowerCase()
      : '';
  const rawMessage = err instanceof Error ? err.message : '';

  if (code === 'auth/popup-closed-by-user') {
    return 'تم إغلاق نافذة تسجيل الدخول بحساب Google قبل إتمام العملية.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'تم إلغاء محاولة تسجيل الدخول السابقة بحساب Google بسبب طلب جديد.';
  }
  if (code === 'auth/popup-blocked') {
    return 'حظر المتصفح النافذة المنبثقة لتسجيل الدخول. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بخدمة المصادقة (Google Auth) بسبب انقطاع الشبكة.';
  }
  return rawMessage || 'فشل تسجيل الدخول بحساب Google. تأكد من السماح بالنوافذ المنبثقة.';
}

export function createBackendErrorDiagnosis({
  status,
  message,
}: {
  status: number | null;
  message?: string | null;
}): ClientAdminAccessDiagnosis {
  const cleanMsg = String(message || '').trim();

  let primaryReasonCode: AccessDenialReasonCode;
  let primaryMessage: string;
  let detailLine: string;

  if (status === 403) {
    primaryReasonCode = 'BACKEND_FORBIDDEN';
    primaryMessage = cleanMsg || 'رفض الخادم الموثوق دخول هذا الحساب لعدم توفر الصلاحية (403).';
    detailLine = 'قرار الخادم الموثوق: رفض صلاحية نهائي (HTTP 403) — لا يسمح لأي تشخيص محلي بتجاوزه.';
  } else if (status === 401) {
    primaryReasonCode = 'BACKEND_UNAUTHENTICATED';
    primaryMessage = cleanMsg
      ? `مشكلة مصادقة مع الخادم (401): ${cleanMsg}`
      : 'مشكلة مصادقة مع الخادم (401): الجلسة أو رمز التحقق غير صالح. أعد تسجيل الدخول أو حدّث التوكن.';
    detailLine = 'قرار الخادم الموثوق: فشل المصادقة (HTTP 401) — تم إيقاف الدخول دون الانتقال إلى مسار Client SDK.';
  } else {
    const codeLabel = typeof status === 'number' && status > 0 ? `HTTP ${status}` : 'خطأ اتصال/خادم';
    primaryReasonCode = 'BACKEND_SERVER_ERROR';
    primaryMessage = cleanMsg
      ? `خطأ في الخادم الموثوق (${codeLabel}): ${cleanMsg} — تعذر التحقق من الصلاحية ولم تُمنح الجلسة.`
      : `خطأ في الخادم الموثوق (${codeLabel}): تعذر التحقق من الصلاحية ولم تُمنح الجلسة.`;
    detailLine = `قرار الخادم الموثوق (${codeLabel}): خطأ خادم صريح — لا يُعد موافقة ولا يتم تجاوزه عبر Client SDK.`;
  }

  return {
    allowed: false,
    resolvedRole: null,
    primaryReasonCode,
    primaryMessage,
    claimCheck: {
      rawRole: null,
      validRole: null,
      present: false,
      valid: false,
      summary: 'لم يُعتمد فحص Claim المحلي لأن التحقق خاضع لقرار الخادم الموثوق.',
    },
    adminDocCheck: {
      status: 'SKIPPED_BACKEND_ERROR',
      exists: false,
      activeValue: undefined,
      activeIsTrue: false,
      rawRole: null,
      rawRoleDisplay: null,
      validRole: null,
      uidMatches: null,
      hasRoleFormattingArtifacts: false,
      hasUidFormattingArtifacts: false,
      errorKind: null,
      errorCode: status ? String(status) : null,
      errorMessage: cleanMsg || null,
      summary: 'لم تُستخدم قراءة Firestore المحلية لتجاوز رفض أو خطأ الخادم.',
    },
    conflictCheck: {
      hasConflict: false,
      conflictType: 'NONE',
      summary: 'توقف التحقق عند استجابة الخادم.',
    },
    findings: [detailLine],
    warnings: [],
  };
}

export interface BackendSessionPayload {
  uid: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions: string[];
  teacherId?: string | null;
  authTime: number;
  mfaVerified: boolean;
}

export async function resolveAdminPortalSession({
  user,
  forceRefreshToken = false,
  checkBackendHealth,
  fetchBackendSession,
  readIdTokenResult,
  readOwnAdminDoc,
}: {
  user: { uid: string; email?: string | null; displayName?: string | null };
  forceRefreshToken?: boolean;
  checkBackendHealth: () => Promise<boolean>;
  fetchBackendSession: () => Promise<BackendSessionPayload>;
  readIdTokenResult: (forceRefresh: boolean) => Promise<IdTokenResultLike>;
  readOwnAdminDoc: (targetUid: string) => Promise<OwnAdminDocSnapshotLike>;
}): Promise<{ session: StaffSession | null; diagnosis: ClientAdminAccessDiagnosis | null }> {
  const backendUp = await checkBackendHealth();

  if (backendUp) {
    try {
      const backendSession = await fetchBackendSession();
      return {
        session: {
          ...backendSession,
          backendOnline: true,
        },
        diagnosis: null,
      };
    } catch (err) {
      const status =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        typeof (err as { status?: unknown }).status === 'number'
          ? ((err as { status: number }).status)
          : null;
      const errMessage = err instanceof Error ? err.message : String(err || '');

      if (status === 403) {
        try {
          const { diagnosis } = await runClientAdminDiagnostic({
            uid: user.uid,
            readIdTokenResult: () => readIdTokenResult(forceRefreshToken),
            readOwnAdminDoc,
            backendErrorMessage: errMessage || 'رفض الخادم الموثوق دخول هذا الحساب (403).',
          });
          // Hard lock: Client SDK diagnostics can NEVER override a backend 403 rejection
          return {
            session: null,
            diagnosis: {
              ...diagnosis,
              allowed: false,
              resolvedRole: null,
              primaryReasonCode: 'BACKEND_FORBIDDEN',
            },
          };
        } catch {
          return {
            session: null,
            diagnosis: createBackendErrorDiagnosis({ status: 403, message: errMessage }),
          };
        }
      }

      if (status === 401) {
        return {
          session: null,
          diagnosis: createBackendErrorDiagnosis({ status: 401, message: errMessage }),
        };
      }

      return {
        session: null,
        diagnosis: createBackendErrorDiagnosis({ status, message: errMessage }),
      };
    }
  }

  // Static frontend Client SDK verification (only when no backend service is running):
  // Reads ONLY the signed-in user's own ID Token claims (abkRole) and own /admins/{uid} doc.
  const { claims, adminDoc, diagnosis } = await runClientAdminDiagnostic({
    uid: user.uid,
    readIdTokenResult: () => readIdTokenResult(forceRefreshToken),
    readOwnAdminDoc,
  });

  if (!diagnosis.allowed) {
    return { session: null, diagnosis };
  }

  const resolved = resolveFrontendStaffRole({
    uid: user.uid,
    claims,
    adminDoc,
  });

  if (!resolved) {
    return { session: null, diagnosis };
  }

  return {
    session: {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || user.email || 'مشرف مداد',
      role: resolved.role,
      permissions: resolved.permissions,
      teacherId: resolved.teacherId,
      authTime: Math.floor(Date.now() / 1000),
      mfaVerified: Boolean(
        (claims.firebase as { sign_in_second_factor?: unknown } | undefined)
          ?.sign_in_second_factor
      ),
      backendOnline: false,
      warnings: diagnosis.warnings,
    },
    diagnosis,
  };
}


