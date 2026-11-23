import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const viteEnv: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY || 'AIzaSyCAGjQq8WWJrJTSQAWBJvw6LJurEmQ5ssU',
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0343268738.firebaseapp.com',
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0343268738',
  storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0343268738.firebasestorage.app',
  messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '438492626356',
  appId: viteEnv.VITE_FIREBASE_APP_ID || '1:438492626356:android:da204cb15944d484a706e1',
};

export const FIRESTORE_DATABASE_ID =
  viteEnv.VITE_FIREBASE_DATABASE_ID ||
  'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const recaptchaKey = viteEnv.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaKey && typeof window !== 'undefined') {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Ignore duplicate AppCheck init in HMR
  }
}

export const firebaseAuth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// CRITICAL: Connect exclusively to the named ABK Firestore database
export const firestoreDb = getFirestore(app, FIRESTORE_DATABASE_ID);
export const firebaseStorage = getStorage(app);
// Prevent Firebase Storage SDK from silently hanging for the default 10 minutes on unreachable buckets/CORS
firebaseStorage.maxUploadRetryTime = 15000;
firebaseStorage.maxOperationRetryTime = 15000;

export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
export const ALLOWED_FILE_MIME = [
  ...ALLOWED_IMAGE_MIME,
  'application/pdf',
  'video/mp4',
  'video/webm',
  'application/zip',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export type UploadFailureCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_TYPE'
  | 'FILE_TOO_LARGE'
  | 'BUCKET_NOT_PROVISIONED'
  | 'UNAUTHORIZED'
  | 'CANCELED'
  | 'TIMEOUT_OR_CORS'
  | 'NETWORK_OFFLINE'
  | 'QUOTA_EXCEEDED'
  | 'UNKNOWN';

export class AbkUploadError extends Error {
  code: UploadFailureCode;
  retryable: boolean;

  constructor(code: UploadFailureCode, message: string, retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface UploadProgressInfo {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
}

export interface UploadResult {
  url: string;
  fullPath: string;
  sizeLabel: string;
}

export interface ActiveUploadHandle {
  promise: Promise<UploadResult>;
  cancel: () => void;
}

export function formatFileSizeLabel(bytes: number): string {
  const sizeMb = bytes / (1024 * 1024);
  return sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function mapStorageErrorToArabic(err: unknown): AbkUploadError {
  if (err instanceof AbkUploadError) return err;

  const rawCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const lowerMsg = rawMessage.toLowerCase();

  if (rawCode === 'storage/canceled') {
    return new AbkUploadError('CANCELED', 'تم إلغاء رفع الملف.', true);
  }
  if (rawCode === 'storage/bucket-not-found' || rawCode === 'storage/project-not-found' || lowerMsg.includes('404')) {
    return new AbkUploadError(
      'BUCKET_NOT_PROVISIONED',
      'خدمة Firebase Storage غير مفعّلة أو الـ Bucket غير موجود في هذا المشروع (404). في خطة Spark المجانية بدون تفعيل الفوترة، استخدم حقل الرابط المباشر المجاني (Google Drive / Cloudflare R2 / GitHub / YouTube).',
      false
    );
  }
  if (rawCode === 'storage/unauthorized' || rawCode === 'storage/unauthenticated') {
    return new AbkUploadError(
      'UNAUTHORIZED',
      'صلاحيات الرفع مرفوضة من قواعد Firebase Storage (storage.rules). تأكد من تسجيل الدخول بحساب مشرف معتمد وأن قواعد التخزين منشورة على هذا الـ Bucket.',
      false
    );
  }
  if (rawCode === 'storage/quota-exceeded') {
    return new AbkUploadError(
      'QUOTA_EXCEEDED',
      'تم استنفاد المساحة المتاحة في Firebase Storage. يمكنك استخدام روابط Google Drive أو Cloudflare R2 المجانية.',
      false
    );
  }
  if (rawCode === 'storage/retry-limit-exceeded' || lowerMsg.includes('cors') || lowerMsg.includes('preflight')) {
    return new AbkUploadError(
      'TIMEOUT_OR_CORS',
      'انتهت مهلة الاتصال بخدمة التخزين أو تم حظر الطلب عبر CORS/الشبكة. تحقق من الاتصال ومن تفعيل Storage وإعدادات CORS للـ Bucket.',
      true
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AbkUploadError(
      'NETWORK_OFFLINE',
      'لا يوجد اتصال بالإنترنت حالياً. تحقق من الشبكة ثم أعد المحاولة.',
      true
    );
  }

  return new AbkUploadError(
    'UNKNOWN',
    rawMessage || 'تعذر إتمام رفع الملف. تحقق من الاتصال وإعدادات التخزين ثم أعد المحاولة.',
    true
  );
}

/**
 * Fast preflight verification of the configured Firebase Storage bucket so missing Spark
 * buckets fail in ~1s with a clear diagnosis instead of hanging silently for 10 minutes.
 */
export async function checkStorageBucketAvailability(
  bucket = firebaseConfig.storageBucket
): Promise<{ available: boolean; reason?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { available: false, reason: 'لا يوجد اتصال بالإنترنت.' };
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`,
      { method: 'GET', signal: controller.signal }
    );
    // 200 (public list), 401/403 (bucket exists and storage.rules protected it) => bucket IS provisioned.
    // 404 => bucket does NOT exist / Firebase Storage is not provisioned on this Spark project.
    if (res.status === 404) {
      return {
        available: false,
        reason: `الـ Bucket (${bucket}) غير مُنشأ على Firebase Storage (HTTP 404).`,
      };
    }
    return { available: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { available: false, reason: 'انتهت مهلة التحقق من خادم التخزين.' };
    }
    // Network/CORS error on preflight — let resumable upload try directly with short timeout watchdog
    return { available: true };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function startAbkAssetUpload(
  file: File,
  folderPath: string,
  options: {
    imageOnly?: boolean;
    onProgress?: (info: UploadProgressInfo) => void;
    onPhaseChange?: (phase: 'checking' | 'uploading') => void;
  } = {}
): ActiveUploadHandle {
  const imageOnly = Boolean(options.imageOnly);
  let activeTask: UploadTask | null = null;
  let canceledByUser = false;
  let stallTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const clearWatchdog = () => {
    if (stallTimer !== null) {
      globalThis.clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const promise = (async (): Promise<UploadResult> => {
    if (!firebaseAuth.currentUser) {
      throw new AbkUploadError(
        'UNAUTHENTICATED',
        'يرجى تسجيل الدخول بحساب مشرف معتمد قبل رفع الملفات.',
        false
      );
    }

    const mime = file.type;
    const allowedList = imageOnly ? ALLOWED_IMAGE_MIME : ALLOWED_FILE_MIME;
    if (!allowedList.includes(mime)) {
      throw new AbkUploadError(
        'INVALID_TYPE',
        imageOnly
          ? 'صيغة الصورة غير مدعومة. المسموح: PNG, JPG, WEBP.'
          : 'صيغة الملف غير مدعومة. المسموح: PDF، صور (PNG/JPG/WEBP)، فيديو MP4/WEBM، مستندات Office، ZIP.',
        false
      );
    }

    const maxBytes = imageOnly ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size <= 0) {
      throw new AbkUploadError('INVALID_TYPE', 'الملف المختار فارغ ولا يمكن رفعه.', false);
    }
    if (file.size > maxBytes) {
      throw new AbkUploadError(
        'FILE_TOO_LARGE',
        imageOnly
          ? 'حجم الصورة يتجاوز الحد الأقصى المسموح (10 MB).'
          : 'حجم الملف يتجاوز الحد الأقصى المسموح في قواعد الأمان (50 MB).',
        false
      );
    }

    options.onPhaseChange?.('checking');
    const preflight = await checkStorageBucketAvailability();
    if (canceledByUser) {
      throw new AbkUploadError('CANCELED', 'تم إلغاء رفع الملف.', true);
    }
    if (!preflight.available) {
      throw new AbkUploadError(
        'BUCKET_NOT_PROVISIONED',
        'خدمة Firebase Storage غير مفعّلة في هذا المشروع (الـ Bucket غير موجود — 404). خطة Spark المجانية الحالية لا تتيح إنشاء Firebase Storage بدون ترقية الفوترة؛ يمكنك استخدام حقل الرابط المباشر المجاني (Google Drive / Cloudflare R2 / GitHub / YouTube).',
        false
      );
    }

    options.onPhaseChange?.('uploading');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    const fullPath = `${cleanFolder}/${Date.now()}_${safeName}`;
    const storageRef = ref(firebaseStorage, fullPath);

    return await new Promise<UploadResult>((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, file, { contentType: mime });
      activeTask = uploadTask;

      const armStallWatchdog = () => {
        clearWatchdog();
        stallTimer = globalThis.setTimeout(() => {
          canceledByUser = false;
          uploadTask.cancel();
          reject(
            new AbkUploadError(
              'TIMEOUT_OR_CORS',
              'توقف الرفع دون استجابة من Firebase Storage لأكثر من 20 ثانية (قد يكون السبب حظر CORS أو عدم تفعيل التخزين أو انقطاع الشبكة).',
              true
            )
          );
        }, 20000);
      };

      armStallWatchdog();

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          armStallWatchdog();
          const total = snapshot.totalBytes || file.size || 1;
          const percent = Math.min(100, Math.round((snapshot.bytesTransferred / total) * 100));
          options.onProgress?.({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: total,
            percent,
          });
        },
        (error) => {
          clearWatchdog();
          if (canceledByUser) {
            reject(new AbkUploadError('CANCELED', 'تم إلغاء عملية الرفع.', true));
            return;
          }
          reject(mapStorageErrorToArabic(error));
        },
        async () => {
          clearWatchdog();
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            if (!url || !/^https?:\/\//i.test(url)) {
              throw new Error('لم يُرجع الخادم رابط تنزيل صالحاً.');
            }
            resolve({
              url,
              fullPath,
              sizeLabel: formatFileSizeLabel(file.size),
            });
          } catch (urlErr) {
            reject(mapStorageErrorToArabic(urlErr));
          }
        }
      );
    });
  })();

  return {
    promise,
    cancel: () => {
      canceledByUser = true;
      clearWatchdog();
      activeTask?.cancel();
    },
  };
}

export async function uploadAbkAsset(
  file: File,
  folderPath: string,
  imageOnly = false
): Promise<UploadResult> {
  return startAbkAssetUpload(file, folderPath, { imageOnly }).promise;
}
