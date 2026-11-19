# لوحة تحكم منصة ABK التعليمية والخادم الموثوق (Admin Portal + Trusted Backend)

هذا المجلد مستقل بالكامل عن تطبيق Android الأصلي (`/app`)، ويشارك معه مشروع Firebase (`gen-lang-client-0343268738`) وقاعدة بيانات Firestore المسماة:
`ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d`

---

## 1. تشغيل البناء والاختبارات محلياً

```bash
cd admin-portal
npm install
npm test        # اختبار الخادم الموثوق، التحقق من المدخلات، ومصفوفة RBAC
npm run build   # التحقق من TypeScript وبناء واجهة لوحة التحكم في dist/
```

---

## 2. متطلبات التشغيل في الإنتاج (Production Setup)

1. **إعداد متغيرات البيئة للخادم (`admin-portal/server/.env`)**:
   - انسخ `admin-portal/.env.example`.
   - أضف بيانات حساب الخدمة (`FIREBASE_SERVICE_ACCOUNT_JSON` أو `GOOGLE_APPLICATION_CREDENTIALS`) في متغيرات البيئة/Secrets فقط (لا ترفعه أبداً إلى Git أو الواجهة الأمامية).
   - اضبط `SUPER_ADMIN_EMAIL=karimaeti07@gmail.com`.
   - اضبط `CORS_ALLOWED_ORIGINS` ليحتوي على رابط لوحة التحكم فقط.

2. **تحديث الحماية في Google Sign-In وApp Check**:
   - أضف نطاق لوحة التحكم (Firebase Hosting أو النطاق الخاص بك) إلى **Authorized domains** في Firebase Authentication.
   - فعّل **App Check** (reCAPTCHA v3 للويب + Play Integrity لأندرويد) واضبط `VITE_RECAPTCHA_SITE_KEY` و`ENFORCE_APP_CHECK=true` في الخادم.
   - يُنصح بتفعيل المصادقة الثنائية (MFA / 2-Step Verification) لحسابات `SUPER_ADMIN` و`ADMIN` في Google Account / Firebase.

3. **نشر قواعد Firestore وStorage**:
   ```bash
   firebase deploy --only firestore:rules,storage
   ```

4. **نشر الخادم الموثوق (Cloud Run أو خادم Node.js)**:
   - شغّل `node server/index.js` على Cloud Run واضبط رابطه في `VITE_API_BASE_URL` عند بناء الواجهة الأمامية.

5. **نشر واجهة لوحة التحكم على Firebase Hosting (منفصلة)**:
   ```bash
   cd admin-portal
   npm run build
   firebase deploy --only hosting --config firebase.hosting.json --project gen-lang-client-0343268738
   ```

---

## 3. سياسة أقل الصلاحيات (Least-Privilege IAM) وSecret Manager

- **لا توضع أي مفاتيح Service Account JSON داخل GitHub Secrets.**
- مصادقة GitHub Actions تتم عبر **Workload Identity Federation (OIDC)** باستخدام المتغيرين غير السريين `GCP_WIF_PROVIDER` و`GCP_DEPLOYER_SA`.
- حساب التشغيل الخاص بـ Cloud Run (`abk-admin-runtime@gen-lang-client-0343268738.iam.gserviceaccount.com`) يحصل فقط على:
  - `roles/datastore.user` (قراءة/كتابة مستندات Firestore فقط)
  - `roles/firebaseauth.admin` (التحقق من الرموز وتعيين Custom Claims وإدارة تعطيل المستخدمين)
  - `roles/secretmanager.secretAccessor` **على السر `abk-firebase-admin-sa` فقط**
- يُحفظ مفتاح Service Account الخاص بـ Firebase Admin SDK داخل **Google Secret Manager** بالاسم `abk-firebase-admin-sa` ويُحقن لـ Cloud Run أثناء التشغيل فقط في `FIREBASE_SERVICE_ACCOUNT_JSON`.

