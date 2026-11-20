# لوحة تحكم منصة ABK التعليمية والخادم الموثوق (خطة مجانية 100%)

هذا المجلد مستقل بالكامل عن تطبيق Android الأصلي (`/app`)، ويشارك معه مشروع Firebase (`gen-lang-client-0343268738`) وقاعدة بيانات Firestore المسماة:
`ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d`

---

## 1. تشغيل البناء والاختبارات محلياً

```bash
cd admin-portal
npm install
npm test        # اختبار الخادم الموثوق، إدارة المستخدمين، ومصفوفة RBAC
npm run build   # التحقق من TypeScript وبناء واجهة لوحة التحكم في dist/
```

---

## 2. البنية المجانية 100% (Firebase Spark — بدون أي بطاقة بنكية أو فواتير)

1. **الواجهة الأمامية (`admin-portal/dist`)**:
   - استضافة مجانية تماماً على **Firebase Hosting (Spark)** أو **Cloudflare Pages** أو **Vercel** أو **Netlify**.
   - تدعم التحكم الكامل في الهيكلة الأكاديمية (المراحل، الصفوف، الفروع، المواد، الوحدات، الدروس)، الأساتذة، كتل المحتوى (فيديو، PDF، صور، ملخصات، Q&A، اختبارات، واجبات)، الهوية والألوان، التنبيهات، وسجل التدقيق عبر Firestore مباشرة وفق قواعد الأمان الصارمة (`firestore.rules`).

2. **الوسائط والملفات بدون تكلفة Storage**:
   - في حال لم تُفعّل خطة Storage (أو لتجنب حدود Blaze)، تدعم لوحة التحكم إدخال **روابط HTTPS خارجية مباشرة** (مثل Google Drive / Cloudflare R2 Free Tier / YouTube / GitHub Releases) لجميع الكتب والنوطات والفيديوهات والصور دون الحاجة لترقية الحساب.

3. **الخادم الموثوق الاختياري (`admin-portal/server`) لإدارة Firebase Auth الكاملة**:
   - مطلوب فقط عند الحاجة إلى: سرد جميع حسابات Firebase Auth (`GET /api/users`)، الحذف النهائي للحسابات (`DELETE /api/users/:uid`)، أو تعيين `Custom Claims` للمشرفين.
   - يمكن تشغيله **مجاناً تماماً** محلياً (`node server/index.js`) أو على خطة مجانية لا تتطلب بطاقة بنكية مثل **Render Free / Koyeb Free**.
   - **لا تُرفع مفاتيح Service Account إلى Git أو GitHub نهائياً**، بل تُمرر فقط عبر متغير البيئة `FIREBASE_SERVICE_ACCOUNT_JSON` في بيئة التشغيل.

4. **خطوات الحماية والربط**:
   - أضف نطاق لوحة التحكم (مثل `gen-lang-client-0343268738.web.app` أو نطاق Cloudflare Pages) إلى **Authorized domains** في Firebase Authentication.
   - اضبط `SUPER_ADMIN_EMAIL=karimaeti07@gmail.com`.
   - انشر قواعد الأمان بالخطة المجانية:
     ```bash
     firebase deploy --only firestore:rules
     ```
