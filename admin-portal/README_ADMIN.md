# لوحة تحكم منصة ABK التعليمية (نشر مجاني 100% على Cloudflare Pages بدون بطاقة بنكية)

هذا المجلد (`admin-portal`) مستقل تماماً عن تطبيق Android الأصلي (`/app`)، ويتصل مباشرة بمشروع Firebase (`gen-lang-client-0343268738`) وقاعدة بيانات Firestore المسماة:
`ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d`

---

## 1. تشغيل البناء والاختبارات محلياً

```bash
cd admin-portal
npm ci
npm test        # اختبار الخادم الموثوق، إدارة المستخدمين، ومصفوفة RBAC
npm run build   # التحقق من TypeScript وبناء الحزمة الثابتة في dist/
```

---

## 2. النشر المجاني على Cloudflare Pages (مباشرة من الهاتف وعبر GitHub — دون بطاقة بنكية)

تم تجهيز جميع ملفات Cloudflare Pages داخل المشروع:
- `admin-portal/public/_redirects` (لحل مشكلة إعادة تحميل الصفحات في تطبيقات SPA).
- `admin-portal/public/_headers` (لإضافة ترويسات الأمان مثل `X-Frame-Options` و`X-Content-Type-Options` و`Referrer-Policy`).
- `admin-portal/wrangler.jsonc` (لتعريف مشروع `abk-admin-portal` ومجلد الإخراج `./dist`).

### خطوات الربط من الهاتف (Cloudflare Dashboard + GitHub):
1. ادفع آخر التعديلات من هنا إلى مستودع GitHub (`karimaeti52-oss/ABK-Educational-App`).
2. افتح متصفح الهاتف واذهب إلى لوحة تحكم Cloudflare ثم: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. اختر مستودع **ABK-Educational-App** والفرع **main**.
4. أدخل إعدادات البناء التالية بدقة:
   - **Project name**: `abk-admin-portal`
   - **Root directory (Build configuration)**: `admin-portal`
   - **Framework preset**: `None` (أو `Vite`)
   - **Build command**: `npm ci && npm run build`
   - **Build output directory**: `dist`
5. أضف متغيرات البيئة في Cloudflare Pages (**Settings → Environment variables**) — جميعها عامة للواجهة ولا تحتوي أي أسرار إدارية:
   - `VITE_FIREBASE_PROJECT_ID` = `gen-lang-client-0343268738`
   - `VITE_FIREBASE_AUTH_DOMAIN` = `gen-lang-client-0343268738.firebaseapp.com`
   - `VITE_FIREBASE_STORAGE_BUCKET` = `gen-lang-client-0343268738.firebasestorage.app`
   - `VITE_FIREBASE_DATABASE_ID` = `ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d`
   - *(اختياري)* `VITE_FIREBASE_APP_ID` = معرف تطبيق الويب بعد تسجيل Web App في Firebase.
6. احفظ وابدأ البناء (**Save and Deploy**). سيعطيك Cloudflare رابط HTTPS مجاني مثل `https://abk-admin-portal.pages.dev`.
7. **خطوة إلزامية لتسجيل دخول Google من الرابط الجديد**:
   - افتح **Firebase Console** ← مشروع `gen-lang-client-0343268738` ← **Authentication** ← **Settings** ← **Authorized domains** ← **Add domain**.
   - أضف نطاق الموقع الفعلي (مثلاً `abk-admin-portal.pages.dev`).

> **بديل صفري الإعدادات**: يمكنك أيضاً النشر إلى **GitHub Pages** مجاناً من تبويب **Actions → Admin Portal CI → Run workflow → github_pages** (دون أي مفاتيح أو حسابات خارجية).

---

## 3. ماذا يعمل بدون Backend vs ماذا يتطلب الخادم الموثوق (`admin-portal/server`)؟

### يعمل مباشرة على Cloudflare Pages + Firestore Spark (مؤمّن عبر `firestore.rules`):
- تسجيل الدخول بحساب Google للمشرف العام (`karimaeti07@gmail.com`) والمشرفين المعتمدين في `/admins`.
- إدارة المراحل، الصفوف، الفروع، المواد، الأساتذة، الوحدات، الدروس، وإعادة ترتيبها.
- إدارة الشروحات والكتل (فيديو، PDF عبر روابط HTTPS مباشرة مجانية، ملخصات، أسئلة وأجوبة، اختبارات، واجبات).
- تعديل الهوية والألوان والأقسام المخصصة والتنبيهات وسجل التدقيق وتصدير نسخة JSON.
- تعطيل أو حظر أو تفعيل ملف الطالب في Firestore (`/users/{uid}`).

### يتطلب تشغيل الخادم الموثوق (`admin-portal/server`) ولا يمكن تجاوزه من المتصفح لأسباب أمنية:
- سرد جميع حسابات Firebase Auth عبر `auth.listUsers()`.
- الحذف النهائي لحساب المستخدم من Firebase Auth (`auth.deleteUser()`).
- الإبطال الفوري لجلسات الدخول (`revokeRefreshTokens()`).
- تعيين أو سحب **Custom Claims** للمشرفين الجدد (`grant/revoke admin claims`).
- الاستعادة الجماعية لنسخة احتياطية كاملة (`/api/backups/restore`).

**ممنوع تماماً** وضع `firebase-admin` أو مفاتيح `Service Account` داخل كود الواجهة الأمامية أو GitHub. عند الحاجة لهذه الوظائف الإضافية لاحقاً، شغّل `admin-portal/server` محلياً أو على استضافة Node مجانية ومرّر رابطها في `VITE_API_BASE_URL` مع وضع `FIREBASE_SERVICE_ACCOUNT_JSON` في متغيرات بيئة الخادم فقط.
