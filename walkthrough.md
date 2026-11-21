# المرجع الشامل لتطوير منصة مداد التعليمية (Midad Educational Platform)

تم تطوير وتحديث المشروع الحالي **ABK** وتحويل هويته الكاملة إلى **«مداد التعليمية»** بشعار **«طريقك نحو التفوق»**، مع الحفاظ التام على معرف الحزمة (`applicationId = "com.aistudio.abkedu.kpmzqx"`), توقيع التطبيق، تسجيل الدخول بحساب Google، وقواعد بيانات Firestore ولوحة التحكم الإدارية.

---

# Security Summary

تمت مراجعة التطبيق ولوحة التحكم وقواعد الأمان وفق معايير **OWASP MASVS** وتطبيق التحصينات التالية فعلياً في الشيفرة المصدرية:

1. **منع الاتصال غير المشفر (Cleartext Traffic Blocked)**:
   - تم تفعيل `<base-config cleartextTrafficPermitted="false" />` في `app/src/main/res/xml/network_security_config.xml` وربطه بملف `AndroidManifest.xml`.
   - تم فرض التحقق الصارم عبر `UrlUtils.isSafeHttpsUrl()` قبل تنزيل ملفات PDF (`PdfCacheManager.kt`), قبل فتح روابط الشروحات الخارجية (`ExplanationDetailScreen.kt`), وقبل تشغيل WebView الخارجي أو تنزيل تحديثات التطبيق (`VideoPlayerScreen.kt`, `AppUpdateManager.kt`).

2. **حماية حزم التحديث داخل التطبيق (OTA / Over-the-Top Update Integrity)**:
   - تُقرأ بيانات التحديث من المستند المحمي `appConfig/android_release` في Firestore.
   - تفرض قواعد Firestore (`isValidAndroidRelease`) أن يكون الناشر مشرفاً (`isAdmin()`), وأن يبدأ رابط `apkUrl` بـ `https://`, وأن تحتوي بصمة `sha256` على 64 خانة ست عشرية صحيحة، مع منع الحذف (`allow delete: if false`).
   - يتحقق التطبيق محلياً من تطابق البصمة الرقمية `SHA-256` وحجم الملف قبل استدعاء مثبّت الحزم (`PackageInstaller` أو `FileProvider` المحصور في مسار `cache/updates/` فقط).

3. **تحصين WebView ومشغل YouTube المضمّن**:
   - تعطيل الوصول للملفات المحلية والمحتوى والموقع داخل `WebView`:
     - `allowFileAccess = false`
     - `allowContentAccess = false`
     - `setGeolocationEnabled(false)`
     - `MIXED_CONTENT_NEVER_ALLOW` في `ExternalVideoWebView`
   - تقييد التنقل في `shouldOverrideUrlLoading` بحيث تبقى إطارات YouTube داخل التطبيق بدون إطلاق `Intent` خارجي إلى تطبيق YouTube أو المتصفح (`autoplay=0`).

4. **حماية التخزين المحلي والنسخ الاحتياطي**:
   - ضبط `android:allowBackup="false"` في `AndroidManifest.xml`.
   - استبعاد `sharedpref` ومجلدات ملفات PDF المخزنة محلياً (`midad_pdfs`, `abk_pdfs`) في `backup_rules.xml` و `data_extraction_rules.xml`.

5. **تقليص بصمة الإصدار ومنع تسريب البيانات (PII & ProGuard/R8)**:
   - تفعيل `isMinifyEnabled = true` و `isShrinkResources = true` لنسخة `release` مع قواعد `proguard-rules.pro` لإزالة سجلات `Log.v` / `Log.d` / `Log.i` في الإصدارات النهائية، والحفاظ على `@Keep` و `@JavascriptInterface`.
   - إزالة البريد الإلكتروني للطالب من رسائل `Log` في `AuthHelper.kt`.

---

## PoC Verification

تم التحقق البرمجي والعملي من الضوابط الأمنية عبر الاختبارات الآلية:

- **اختبارات قواعد Firestore على المحاكي المحلي (Firestore Emulator Tests - `firestore.test.js`)**:
  - التحقق من رفض القراءة للزوار غير المسجلين (`unauthenticatedContext`) لكل المجموعات بما فيها `appConfig/android_release`.
  - التحقق من رفض كتابة الطلاب العاديين أو الحسابات المحظورة (`BANNED`) أو المشرفين المزيفين (`email_verified = false`) في `appConfig/android_release`.
  - التحقق من رفض الروابط غير المشفرة (`http://...`) أو بصمات `SHA-256` غير الصالحة حتى عند كتابتها من حساب المشرف، وقبول الروابط المشفرة (`https://...`) مع 64 خانة `SHA-256` صالحة فقط.
- **اختبارات سلامة الروابط والتحديثات (`UrlUtilsTest.kt`, `AppUpdateTest.kt`)**:
  - إثبات رفض بروتوكولات `http://`, `javascript:`, `intent://`, `file://`, `data:` وقبول `https://` فقط في `UrlUtils.isSafeHttpsUrl`.
  - إثبات اكتشاف ورفض ملفات APK المعدّلة أو التالفة عبر `AppUpdateManager.verifyFileSha256` مقارنةً بالملف السليم.

---

## نظام التحديث داخل التطبيق والانتقال إلى Google Play مستقبلاً

- **الآلية الحالية (توزيع مباشر مع الحفاظ على بيانات الطالب)**:
  - يستخدم التطبيق نفس `applicationId` (`com.aistudio.abkedu.kpmzqx`) ونفس شهادة التوقيع (`signingConfigs`), لذلك عند تثبيت الإصدار الجديد فوق القديم تبقى جلسة Google Sign-In وذاكرة Firestore وملفات PDF المحفوظة دون أي فقدان.
  - تم إضافة قسم **«نشر تحديث تطبيق مداد»** داخل لوحة التحكم الإدارية (`إعدادات المنصة -> نشر تحديث تطبيق مداد`) لكتابة `versionCode`, `versionName`, `apkUrl (https://)`, `sha256`, وملاحظات التحديث في `appConfig/android_release`.
  - يمكن للطالب التحقق يدوياً من التحديثات من شاشة **حسابي** عبر زر **«التحقق من التحديثات»**, بالإضافة إلى الفحص التلقائي عند تشغيل التطبيق.
- **الانتقال المستقبلي إلى Google Play**:
  - تم تجهيز الواجهة المجردة `StoreUpdatePort` و `PlayStoreStubPort` في `app/src/main/java/com/example/update/AppUpdateModels.kt` لتسهيل استبدال آلية تنزيل APK المباشر بمكتبة Google Play In-App Updates (`AppUpdateManagerFactory`) مستقبلاً دون تغيير شاشات التطبيق.

---

## تحليل قابلية التوسع لـ 10,000 طالب على خطة Firebase Spark المجانية

تفرض خطة **Firebase Spark** المجانية الحدود اليومية التالية على Cloud Firestore:
- **القراءة (Reads):** 50,000 عملية قراءة يومياً
- **الكتابة (Writes):** 20,000 عملية كتابة يومياً
- **الحذف (Deletes):** 20,000 عملية حذف يومياً
- **التخزين:** 1 GiB

### التحسينات المطبّقة لتقليل استهلاك الحصة والأداء:
1. **ذاكرة تخزين مؤقتة دائمة (50 MB Persistent Cache):** تقرأ الشاشات المتكررة المواد والوحدات والدروس من الكاش المحلي في `resolveAbkFirestore`.
2. **تحديد سقف الاستعلامات وصفحات التمرير (`.limit(...)` + `CursorPage`):**
   - تم تقييد جميع تدفقات `AbkContentRepository` و `StudentRepository` (`CATALOG_LIMIT=150`, `SUBJECTS_LIMIT=150`, `LESSONS_LIMIT=300`, `CONTENT_BLOCKS_LIMIT=500`, `FAVORITES_LIMIT=200`, `PROGRESS_LIMIT=200`, `READ_ANNOUNCEMENTS_LIMIT=100`).
3. **تقليص كتابة تقدم المشاهدة (Debounced Progress Writes):**
   - بدلاً من الكتابة المستمرة أثناء التشغيل، يرسل `VideoPlayerScreen` حفظ التقدم إلى Firestore فقط كل `20 ثانية` فأكثر، أو عند قفز الشريط بأكثر من `15 ثانية`, أو عند إكمال الدرس أو الخروج من الشاشة، مع تجاهل الكتابة المتكررة في `StudentRepository` إذا كان التغيير أقل من `ثانيتين`.
4. **تحجيم ذاكرة الصور (Bounded Coil Cache):** تحديد ذاكرة الرام للصور بنسبة `15%` والكاش على القرص بحد أقصى `40 MB`.

### التقييم الصادق للسعة الفعلية على الخطة المجانية:
- **قاعدة طلاب إجمالية 10,000 مستخدم مسجل (بنسبة نشاط يومي ~20% أي قرابة 2,000 طالب نشط يومياً):**
  - بفضل الكاش المحلي وتقليل كتابة التقدم (بمتوسط ~25 قراءة فعلية من السحابة و ~10 كتابات يومياً للطالب النشط)، يبقى الاستهلاك في حدود `50,000` قراءة و `20,000` كتابة يومياً وهو متوافق مع خطة Spark المجانية.
- **ذروة 10,000 طالب نشط ومتزامن في نفس اليوم الواحد (موسم امتحانات مثلاً):**
  - إذا فتح 10,000 طالب التطبيق وتفاعلوا جميعاً في يوم واحد (بمتوسط 25 قراءة و 10 كتابات لكل طالب = ~250,000 قراءة و ~100,000 كتابة)، سيتجاوز الاستهلاك الحدود اليومية الثابتة لخطة Spark المجانية، وسيلزم حينها الترقية إلى خطة **Blaze (الدفع حسب الاستخدام)**.

---

## ملخص نتائج الاختبارات والتحقق المنفّذة

- **بناء Android (`compile_applet`)**: نجاح كامل (`Build succeeded - the applet is compiled`).
- **اختبارات Android (`gradle :app:testDebugUnitTest`)**: نجاح جميع الاختبارات الـ **30** (`BUILD SUCCESSFUL`) بما فيها:
  - `ExampleRobolectricTest` (التحقق من `app_name = "مداد التعليمية"`).
  - `MainActivityStartupTest` (التحقق من إقلاع `MainActivity` سواءً مع تهيئة Firebase أو بدونها).
  - `AbkUiScreensRobolectricTest` (التحقق من شاشة الدخول، الرئيسية بهوية مداد، الحفاظ على الهوية المخصصة، شاشة الحساب والوضع الليلي، الاختبارات والأسئلة، والـ YouTube Shorts داخل التطبيق).
  - `AppUpdateTest` (التحقق من شروط `AppReleaseManifest`, بصمة `SHA-256`, رفض APK معدل، وحالات `UpdateDialog`).
  - `PerformanceBenchmarkTest` (تصفية وترقيم 10,000 درس دون بطء + سرعة حساب `SHA-256` + ميزانية Spark).
  - `UrlUtilsTest` (استخراج معرفات YouTube وفحص روابط `https://` فقط).
- **اختبارات قواعد Firestore على المحاكي (`firestore.test.js`)**: نجاح **9 / 9** اختبارات شاملة الصلاحيات ومنع الاختراق والتحقق من `appConfig/android_release`.

