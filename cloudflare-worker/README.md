# Midad Media Worker (`cloudflare-worker`)

Worker وسيط آمن لربط تطبيق **مداد التعليمية** ولوحة الإدارة بـ **Cloudflare R2** (و**Backblaze B2** عند تجهيزه والتحقق الفعلي منه)، مع حماية ملفات الطلاب عبر Firebase ID Token.

## المزايا المنفذة
- **حماية ملفات الطلاب افتراضياً (`READ_ACCESS_MODE = "authenticated"`)**:
  - تتطلب قراءة الدروس والملفات رمز `Authorization: Bearer <Firebase ID Token>` صالحاً مع التحقق من عدم حظر أو إيقاف حساب الطالب (`fail-closed` عند تعذر الاتصال بـ Firestore).
  - يُسمح بالقراءة غير المصادق عليها **فقط** للعناصر المرفوعة ببيان وصفي صريح `accessLevel = "public"` (مثل شعار المنصة والبانر الترحيبي في `branding`).
  - تم منع تمرير التوكن في رابط URL (`?token=`).
- **إدارة الصلاحيات بدون بريد مشرف ثابت في المستودع**:
  - يعتمد Worker على Custom Claim (`abkRole`) ومجموعة `/admins/{uid}` في Firestore، ويمكن إضافة `SUPER_ADMIN_EMAIL` اختيارياً كـ Wrangler Secret فقط.
- **رفع مجزأ قابل للاستئناف (Multipart 5 MB) + بث Range 206**:
  - مسارات القراءة: `/files/*` لـ Cloudflare R2، و`/b2/files/*` لـ Backblaze B2 (عبر AWS SigV4 S3 API).
  - مسارات الإدارة والرفع: `/quota` و`/providers/status` و`/upload` و`/multipart/{init,part,complete,abort}` و`/object` مع معامل `provider` (`r2` أو `b2`) و`accessLevel` (`private` أو `public`).

## توزيع السعة التخزينية (20 GB مستهدفة فقط عند تفعيل المزودين والتحقق منهما)
- **Cloudflare R2**: حد فعلي مستقل **10 GB** (`DEFAULT_R2_LIMIT_GB = "10"`).
- **Backblaze B2**: حصة مخططة **10 GB** (`DEFAULT_B2_LIMIT_GB = "10"`) ومُعطّل افتراضياً (`B2_ENABLED = "false"`).
- لا تُحتسب الـ **20 GB** إلا بعد ربط R2 وB2 والتحقق الفعلي من كليهما عبر فحص حي؛ وقبل تفعيل B2 تبقى السعة المتاحة الفعلية **10 GB لـ R2 فقط**.
- تبقى جميع ملفات R2 الحالية في أماكنها ولا تُنقل أو تُحذف تلقائياً.

## خطوات التجهيز اليدوية (عند الاستعداد للنشر)
1. ضبط المتغيرات السرية في Worker عبر `wrangler secret put` (دون وضعها في `wrangler.toml`):
   - `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET_NAME`, `B2_KEY_ID`, `B2_APPLICATION_KEY` (عند تفعيل B2)
   - `SUPER_ADMIN_EMAIL` (اختياري)
2. التحقق محلياً عبر `node --test tests/worker.test.js` قبل أي نشر.
