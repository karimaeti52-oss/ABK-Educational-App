import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCAGjQq8WWJrJTSQAWBJvw6LJurEmQ5ssU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0343268738.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0343268738',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0343268738.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '438492626356',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:438492626356:android:da204cb15944d484a706e1',
};

export const FIRESTORE_DATABASE_ID =
  import.meta.env.VITE_FIREBASE_DATABASE_ID ||
  'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d';

export const SUPER_ADMIN_EMAIL = 'karimaeti07@gmail.com';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
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

const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_FILE_MIME = [
  ...ALLOWED_IMAGE_MIME,
  'application/pdf',
  'video/mp4',
  'application/zip',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export async function uploadAbkAsset(
  file: File,
  folderPath: string,
  imageOnly = false
): Promise<{ url: string; fullPath: string; sizeLabel: string }> {
  const mime = file.type;
  const allowedList = imageOnly ? ALLOWED_IMAGE_MIME : ALLOWED_FILE_MIME;
  if (!allowedList.includes(mime)) {
    throw new Error(
      imageOnly
        ? 'صيغة الصورة غير مدعومة. المسموح: PNG, JPG, WEBP.'
        : 'نوع الملف غير مسموح لأسباب أمنية.'
    );
  }
  const maxBytes = imageOnly ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(imageOnly ? 'حجم الصورة يتجاوز الحد الأقصى (10 MB).' : 'حجم الملف يتجاوز 50 MB.');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = `${folderPath}/${Date.now()}_${safeName}`;
  const storageRef = ref(firebaseStorage, fullPath);
  const snapshot = await uploadBytes(storageRef, file, { contentType: mime });
  const url = await getDownloadURL(snapshot.ref);
  const sizeMb = file.size / (1024 * 1024);
  const sizeLabel = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  return { url, fullPath, sizeLabel };
}
