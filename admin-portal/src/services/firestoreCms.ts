import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseAuth, firestoreDb } from '../firebase';
import type {
  AdminEntry,
  AndroidReleaseManifest,
  Announcement,
  AuditLog,
  BackupSnapshot,
  CatalogNode,
  ContentBlock,
  CustomSectionType,
  Lesson,
  LessonExplanation,
  MediaAsset,
  PlatformConfig,
  PublishStatus,
  StaffSession,
  StudyMaterial,
  Subject,
  Teacher,
  UnitItem,
  UserProfile,
} from '../types';
import { deleteR2ObjectIfConfigured } from './r2UploadClient';
import { DEFAULT_R2_LIMITS, PERMANENT_MIDAD_APK_URL, type R2UploadResult } from '../utils/r2Upload';

function cleanPayload<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && key !== 'id') {
      result[key] = val;
    }
  }
  return result;
}

export function subscribeCollection<T extends { id: string }>(
  collectionName: string,
  onData: (items: T[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(firestoreDb, collectionName),
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) }) as T);
      onData(items);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribePlatformConfig(
  onData: (config: PlatformConfig) => void
): Unsubscribe {
  return onSnapshot(doc(firestoreDb, 'platformConfig', 'main'), (snap) => {
    if (snap.exists()) {
      onData({ ...DEFAULT_PLATFORM_CONFIG, ...(snap.data() as Partial<PlatformConfig>) });
    } else {
      onData(DEFAULT_PLATFORM_CONFIG);
    }
  });
}

const cmsEnv: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  platformName: 'مداد التعليمية',
  platformTagline: 'طريقك نحو التفوق',
  homeHeadline: 'ماذا تدرس اليوم؟',
  welcomeTitle: 'ابدأ رحلتك التعليمية اليوم',
  welcomeSubtitle: 'دروس مرئية، شروحات لعدة أساتذة، ملخصات واختبارات تفاعلية',
  primaryColorHex: '#142A43',
  secondaryColorHex: '#167D83',
  accentColorHex: '#C7A15A',
  bottomNavItems: [
    { route: 'home', label: 'الرئيسية', iconKey: 'home', visible: true, sortOrder: 1 },
    { route: 'subjects', label: 'المواد', iconKey: 'book', visible: true, sortOrder: 2 },
    { route: 'library', label: 'مكتبتي', iconKey: 'bookmarks', visible: true, sortOrder: 3 },
    { route: 'notifications', label: 'الإشعارات', iconKey: 'notifications', visible: true, sortOrder: 4 },
    { route: 'account', label: 'حسابي', iconKey: 'person', visible: true, sortOrder: 5 },
  ],
  allowOfflinePdf: true,
  showAnnouncements: true,
  showContinueWatching: true,
  maintenanceMode: false,
  r2WorkerBaseUrl: cmsEnv.VITE_R2_WORKER_URL || '',
  maxVideoSizeMb: DEFAULT_R2_LIMITS.maxVideoSizeMb,
  maxPdfSizeMb: DEFAULT_R2_LIMITS.maxPdfSizeMb,
  maxImageSizeMb: DEFAULT_R2_LIMITS.maxImageSizeMb,
  r2StorageLimitGb: DEFAULT_R2_LIMITS.r2StorageLimitGb,
  b2StorageLimitGb: DEFAULT_R2_LIMITS.b2StorageLimitGb,
  b2Enabled: DEFAULT_R2_LIMITS.b2Enabled,
  totalStorageLimitGb: DEFAULT_R2_LIMITS.totalStorageLimitGb,
  updatedBy: 'system',
};

export const DEFAULT_ANDROID_RELEASE: AndroidReleaseManifest = {
  versionCode: 3,
  versionName: '1.1.1',
  minSupportedVersionCode: 1,
  apkUrl: PERMANENT_MIDAD_APK_URL,
  sha256: '',
  fileSizeBytes: 0,
  releaseNotes: '',
  mandatory: false,
};

export async function recordAudit(
  staff: StaffSession | null,
  action: string,
  entityType: string,
  entityId: string,
  summary: string
) {
  const uid = staff?.uid || firebaseAuth.currentUser?.uid;
  if (!uid) return;
  try {
    await addDoc(collection(firestoreDb, 'auditLogs'), {
      actorUid: uid,
      actorEmail: staff?.email || firebaseAuth.currentUser?.email || '',
      actorRole: staff?.role || 'ADMIN',
      action,
      entityType,
      entityId,
      summary: summary.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Audit log write skipped:', e);
  }
}

export function normalizeStatusFlags(status: PublishStatus, softDeleted = false) {
  if (softDeleted) {
    return { status: 'ARCHIVED' as PublishStatus, published: false };
  }
  return {
    status,
    published: status === 'PUBLISHED',
  };
}

export async function upsertEntity(
  collectionName: string,
  existingId: string | undefined,
  data: Record<string, unknown>,
  staff: StaffSession | null,
  auditLabel: string
): Promise<string> {
  const uid = staff?.uid || firebaseAuth.currentUser?.uid || '';
  const ref = existingId
    ? doc(firestoreDb, collectionName, existingId)
    : doc(collection(firestoreDb, collectionName));

  if (!existingId) {
    await setDoc(
      ref,
      cleanPayload({
        ...data,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await recordAudit(staff, 'CREATE', collectionName, ref.id, `إضافة: ${auditLabel}`);
  } else {
    await updateDoc(
      ref,
      cleanPayload({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
    await recordAudit(staff, 'UPDATE', collectionName, ref.id, `تعديل: ${auditLabel}`);
  }
  return ref.id;
}

export async function softDeleteEntity(
  collectionName: string,
  id: string,
  staff: StaffSession | null,
  label: string
) {
  await updateDoc(doc(firestoreDb, collectionName, id), {
    published: false,
    status: 'ARCHIVED',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recordAudit(staff, 'SOFT_DELETE', collectionName, id, `نقل إلى الأرشيف/المحذوفات: ${label}`);
}

export async function restoreEntity(
  collectionName: string,
  id: string,
  staff: StaffSession | null,
  label: string,
  publishImmediately = false
) {
  await updateDoc(doc(firestoreDb, collectionName, id), {
    deletedAt: deleteField(),
    status: publishImmediately ? 'PUBLISHED' : 'DRAFT',
    published: publishImmediately,
    updatedAt: serverTimestamp(),
  });
  await recordAudit(staff, 'RESTORE', collectionName, id, `استعادة من المحذوفات: ${label}`);
}

export async function hardDeleteEntity(
  collectionName: string,
  id: string,
  staff: StaffSession | null,
  label: string,
  options?: {
    r2ObjectKey?: string;
    storageProvider?: 'r2' | 'b2';
    fileUrl?: string;
    platformConfig?: Partial<PlatformConfig>;
  }
) {
  if (options?.r2ObjectKey) {
    try {
      await deleteR2ObjectIfConfigured(
        options.r2ObjectKey,
        options.platformConfig,
        options.storageProvider,
        options.fileUrl
      );
    } catch (e) {
      console.warn('Storage object cleanup skipped:', e);
    }
  }
  await deleteDoc(doc(firestoreDb, collectionName, id));
  await recordAudit(staff, 'HARD_DELETE', collectionName, id, `حذف نهائي: ${label}`);
}

export async function registerUploadedMediaAsset(
  meta: R2UploadResult,
  details: {
    title: string;
    description?: string;
    durationLabel?: string;
    nodeIds?: string[];
    subjectId?: string;
    unitId?: string;
    lessonId?: string;
    published?: boolean;
  },
  staff: StaffSession | null
): Promise<string> {
  const published = details.published ?? true;
  return await upsertEntity(
    'mediaAssets',
    undefined,
    {
      title: (details.title || meta.fileName).trim().slice(0, 160),
      description: details.description?.trim() || undefined,
      fileName: meta.fileName,
      objectKey: meta.objectKey,
      storageProvider: meta.storageProvider,
      fileUrl: meta.url,
      contentType: meta.contentType,
      mediaKind: meta.mediaKind,
      sizeBytes: Math.max(1, Math.round(meta.sizeBytes)),
      durationLabel: details.durationLabel?.trim() || undefined,
      nodeIds: details.nodeIds?.length ? details.nodeIds : undefined,
      subjectId: details.subjectId || undefined,
      unitId: details.unitId || undefined,
      lessonId: details.lessonId || undefined,
      published,
      status: published ? 'PUBLISHED' : 'DRAFT',
    },
    staff,
    details.title || meta.fileName
  );
}

export async function updateEntityStatus(
  collectionName: string,
  id: string,
  status: PublishStatus,
  staff: StaffSession | null,
  label: string
) {
  await updateDoc(doc(firestoreDb, collectionName, id), {
    status,
    published: status === 'PUBLISHED',
    deletedAt: deleteField(),
    updatedAt: serverTimestamp(),
  });
  await recordAudit(staff, 'STATUS_CHANGE', collectionName, id, `تغيير حالة (${label}) إلى ${status}`);
}

export async function commitSortOrderBatch(
  collectionName: string,
  orderedIds: string[],
  orderField: 'sortOrder' | 'lessonOrder' = 'sortOrder'
) {
  const batch = writeBatch(firestoreDb);
  orderedIds.forEach((id, index) => {
    batch.update(doc(firestoreDb, collectionName, id), {
      [orderField]: index + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function savePlatformConfig(
  config: PlatformConfig,
  staff: StaffSession | null
) {
  const uid = staff?.uid || firebaseAuth.currentUser?.uid || 'admin';
  await setDoc(
    doc(firestoreDb, 'platformConfig', 'main'),
    cleanPayload({
      ...config,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
  );
  await recordAudit(staff, 'UPDATE_BRANDING', 'platformConfig', 'main', `تحديث هوية وتصميم المنصة (${config.platformName})`);
}

export function subscribeAndroidRelease(
  onData: (release: AndroidReleaseManifest) => void
): Unsubscribe {
  return onSnapshot(doc(firestoreDb, 'appConfig', 'android_release'), (snap) => {
    if (snap.exists()) {
      onData({ ...DEFAULT_ANDROID_RELEASE, ...(snap.data() as Partial<AndroidReleaseManifest>) });
    } else {
      onData(DEFAULT_ANDROID_RELEASE);
    }
  });
}

export async function saveAndroidRelease(
  release: AndroidReleaseManifest,
  staff: StaffSession | null
) {
  const apkUrl = release.apkUrl.trim();
  const sha256 = release.sha256.trim().toLowerCase();
  if (!/^https:\/\/\S+$/i.test(apkUrl)) {
    throw new Error('رابط ملف APK يجب أن يبدأ بـ https:// ولا يحتوي على مسافات.');
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('بصمة SHA-256 غير صالحة (يجب أن تتكون من 64 خانة ست عشرية).');
  }
  const versionCode = Math.floor(Number(release.versionCode));
  if (!Number.isFinite(versionCode) || versionCode < 1) {
    throw new Error('رقم الإصدار (versionCode) يجب أن يكون عدداً صحيحاً أكبر من 0.');
  }
  const minSupported = Math.max(0, Math.floor(Number(release.minSupportedVersionCode || 0)));
  const fileSize = Math.max(0, Math.floor(Number(release.fileSizeBytes || 0)));
  const uid = staff?.uid || firebaseAuth.currentUser?.uid || 'admin';
  await setDoc(
    doc(firestoreDb, 'appConfig', 'android_release'),
    {
      versionCode,
      versionName: release.versionName.trim(),
      minSupportedVersionCode: minSupported,
      apkUrl,
      sha256,
      fileSizeBytes: fileSize,
      releaseNotes: release.releaseNotes.trim(),
      mandatory: Boolean(release.mandatory),
      publishedAtMillis: Date.now(),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    }
  );
  await recordAudit(
    staff,
    'PUBLISH_ANDROID_RELEASE',
    'appConfig',
    'android_release',
    `نشر تحديث تطبيق Android: v${release.versionName.trim()} (${versionCode})`
  );
}

export async function exportClientSnapshotJson(): Promise<Record<string, unknown>> {
  const collections = [
    'platformConfig',
    'catalogNodes',
    'subjects',
    'units',
    'teachers',
    'lessons',
    'lessonExplanations',
    'contentBlocks',
    'customSectionTypes',
    'materials',
    'mediaAssets',
    'announcements',
  ];
  const out: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {};
  for (const name of collections) {
    const snap = await getDocs(collection(firestoreDb, name));
    out[name] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
  return {
    version: 'abk-backup-v1',
    exportedAt: new Date().toISOString(),
    databaseId: 'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d',
    collections: out,
  };
}

export type CmsStore = {
  nodes: CatalogNode[];
  subjects: Subject[];
  units: UnitItem[];
  teachers: Teacher[];
  lessons: Lesson[];
  explanations: LessonExplanation[];
  blocks: ContentBlock[];
  customTypes: CustomSectionType[];
  materials: StudyMaterial[];
  mediaAssets: MediaAsset[];
  announcements: Announcement[];
  users: UserProfile[];
  admins: AdminEntry[];
  auditLogs: AuditLog[];
  backups: BackupSnapshot[];
  platformConfig: PlatformConfig;
};
