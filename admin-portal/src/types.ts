export type StaffRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CONTENT_MANAGER'
  | 'TEACHER'
  | 'VIEWER';

export type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type CatalogNodeType = 'STAGE' | 'GRADE' | 'BRANCH' | 'COURSE' | 'CUSTOM';
export type VideoSourceType = 'YOUTUBE' | 'MP4' | 'EXTERNAL';
export type MediaKind = 'VIDEO' | 'PDF' | 'IMAGE' | 'ATTACHMENT';
export type MaterialType =
  | 'TEXTBOOK'
  | 'STUDY_NOTE'
  | 'SUMMARY'
  | 'IMPORTANT_QUESTIONS'
  | 'WORKSHEET'
  | 'PRACTICE_EXAM'
  | 'ASSIGNMENT';
export type AnnouncementCategory = 'NEW_LESSON' | 'NEW_MATERIAL' | 'GENERAL' | 'URGENT';
export type ContentBlockType =
  | 'YOUTUBE_VIDEO'
  | 'EXTERNAL_VIDEO'
  | 'PDF_FILE'
  | 'IMAGE'
  | 'NOTE_SUMMARY'
  | 'QA'
  | 'QUIZ_MCQ'
  | 'QUIZ_TRUE_FALSE'
  | 'INTERACTIVE_EXAM'
  | 'RICH_TEXT'
  | 'EXTERNAL_LINK'
  | 'DOWNLOAD_FILE'
  | 'ASSIGNMENT'
  | 'CUSTOM';

export type NavSectionId =
  | 'dashboard'
  | 'stages'
  | 'branches'
  | 'subjects'
  | 'units'
  | 'lessons'
  | 'teachers'
  | 'explanations'
  | 'videos'
  | 'materials'
  | 'quizzes'
  | 'media'
  | 'students'
  | 'admins'
  | 'branding'
  | 'announcements'
  | 'audit'
  | 'backups'
  | 'settings';

export interface StaffSession {
  uid: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions: string[];
  teacherId?: string | null;
  authTime: number;
  mfaVerified: boolean;
  backendOnline: boolean;
}

export interface QaItem {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  questionType: 'MCQ' | 'TRUE_FALSE';
}

export interface CatalogNode {
  id: string;
  parentId?: string;
  nodeType: CatalogNodeType;
  typeLabel: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  iconKey?: string;
  accentColorHex?: string;
  sortOrder: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Subject {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  iconKey: string;
  nodeIds?: string[];
  nodePathLabel?: string;
  teacherIds?: string[];
  sortOrder: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UnitItem {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  description?: string;
  sortOrder: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Teacher {
  id: string;
  name: string;
  headline?: string;
  bio?: string;
  photoUrl?: string;
  linkedUid?: string;
  subjectIds?: string[];
  nodeIds?: string[];
  youtubeUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  sortOrder: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Lesson {
  id: string;
  subjectId: string;
  subjectName: string;
  unitId?: string;
  unitTitle: string;
  unitOrder: number;
  lessonOrder: number;
  title: string;
  description: string;
  teacherName?: string;
  durationLabel?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  videoSourceType: VideoSourceType;
  r2ObjectKey?: string;
  sizeBytes?: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LessonExplanation {
  id: string;
  lessonId: string;
  lessonTitle?: string;
  subjectId: string;
  subjectName?: string;
  teacherId: string;
  teacherName: string;
  teacherPhotoUrl?: string;
  teacherUid?: string;
  title: string;
  summary?: string;
  sortOrder: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ContentBlock {
  id: string;
  explanationId: string;
  lessonId: string;
  subjectId: string;
  teacherId: string;
  teacherUid?: string;
  blockType: ContentBlockType;
  customTypeKey?: string;
  title: string;
  subtitle?: string;
  bodyText?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  durationLabel?: string;
  fileSizeLabel?: string;
  r2ObjectKey?: string;
  sizeBytes?: number;
  qaItems?: QaItem[];
  quizQuestions?: QuizQuestion[];
  sortOrder: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomSectionType {
  id: string;
  key: string;
  labelAr: string;
  description?: string;
  iconKey?: string;
  accentColorHex?: string;
  published: boolean;
  createdBy: string;
}

export interface BottomNavConfigItem {
  route: string;
  label: string;
  iconKey: string;
  visible: boolean;
  sortOrder: number;
}

export interface PlatformConfig {
  platformName: string;
  platformTagline: string;
  homeHeadline: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  logoUrl?: string;
  heroBannerUrl?: string;
  primaryColorHex: string;
  secondaryColorHex: string;
  accentColorHex?: string;
  bottomNavItems?: BottomNavConfigItem[];
  allowOfflinePdf?: boolean;
  showAnnouncements?: boolean;
  showContinueWatching?: boolean;
  maintenanceMode?: boolean;
  r2WorkerBaseUrl?: string;
  maxVideoSizeMb?: number;
  maxPdfSizeMb?: number;
  maxImageSizeMb?: number;
  totalStorageLimitGb?: number;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface AndroidReleaseManifest {
  versionCode: number;
  versionName: string;
  minSupportedVersionCode?: number;
  apkUrl: string;
  sha256: string;
  fileSizeBytes?: number;
  releaseNotes: string;
  mandatory: boolean;
  publishedAtMillis?: number;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface StudyMaterial {
  id: string;
  subjectId: string;
  subjectName: string;
  lessonId?: string;
  lessonTitle?: string;
  teacherId?: string;
  teacherUid?: string;
  nodeIds?: string[];
  materialType: MaterialType;
  title: string;
  description: string;
  coverUrl?: string;
  fileUrl: string;
  r2ObjectKey?: string;
  sizeBytes?: number;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MediaAsset {
  id: string;
  title: string;
  description?: string;
  fileName: string;
  objectKey: string;
  fileUrl: string;
  contentType: string;
  mediaKind: MediaKind;
  sizeBytes: number;
  durationLabel?: string;
  nodeIds?: string[];
  subjectId?: string;
  unitId?: string;
  lessonId?: string;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface R2StorageLimits {
  maxVideoSizeMb: number;
  maxPdfSizeMb: number;
  maxImageSizeMb: number;
  totalStorageLimitGb: number;
}

export interface R2QuotaStatus {
  usedBytes: number;
  totalLimitBytes: number;
  remainingBytes: number;
  fileCount: number;
  usedPercent: number;
  nearLimit: boolean;
  limits: R2StorageLimits;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  subjectId?: string;
  pinned: boolean;
  published: boolean;
  status?: PublishStatus;
  deletedAt?: unknown;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UserAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  photoUrl?: string;
  role: string;
  accountStatus: UserAccountStatus;
  banReason?: string;
  bannedAt?: unknown;
  bannedBy?: string;
  lastActiveAt?: unknown;
  createdAt?: unknown;
}

export interface AuthUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string | null;
  disabled: boolean;
  emailVerified: boolean;
  creationTime?: string | null;
  lastSignInTime?: string | null;
  providerIds: string[];
  role: string;
  accountStatus: UserAccountStatus;
  banReason?: string | null;
  bannedAt?: string | null;
  bannedBy?: string | null;
  hasFirestoreProfile: boolean;
  authPresent: boolean;
}

export interface AdminEntry {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  role?: StaffRole;
  permissions?: string[];
  teacherId?: string;
  active?: boolean;
  grantedBy: string;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  createdAt?: unknown;
}

export interface BackupSnapshot {
  id: string;
  label: string;
  createdByUid: string;
  createdByEmail?: string;
  documentCounts?: Record<string, number>;
  createdAt?: unknown;
}

export const BLOCK_TYPE_LABELS: Record<ContentBlockType, string> = {
  YOUTUBE_VIDEO: 'فيديو يوتيوب',
  EXTERNAL_VIDEO: 'فيديو مباشر (MP4 / رابط)',
  PDF_FILE: 'ملف PDF / نوطة',
  IMAGE: 'صورة تعليمية',
  NOTE_SUMMARY: 'ملخص / ملاحظات',
  QA: 'سؤال وجواب (Q&A)',
  QUIZ_MCQ: 'اختبار اختيار من متعدد',
  QUIZ_TRUE_FALSE: 'اختبار صح وخطأ',
  INTERACTIVE_EXAM: 'اختبار تفاعلي شامل',
  RICH_TEXT: 'نص منسق / مقالة',
  EXTERNAL_LINK: 'رابط خارجي',
  DOWNLOAD_FILE: 'ملف قابل للتنزيل',
  ASSIGNMENT: 'واجب / تكليف',
  CUSTOM: 'قسم مخصص',
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: 'مدير عام (Super Admin)',
  ADMIN: 'مدير نظام',
  CONTENT_MANAGER: 'مدير محتوى',
  TEACHER: 'أستاذ',
  VIEWER: 'مشرف عرض فقط',
};
