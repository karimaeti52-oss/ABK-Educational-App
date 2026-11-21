# Midad R2 Media Worker (`cloudflare-worker`)

Worker وسيط آمن لربط تطبيق **مداد التعليمية** ولوحة الإدارة بـ **Cloudflare R2** بدون أي مفاتيح R2 سرية في التطبيق أو المتصفح أو المستودع.

## المزايا المنفذة
- التحقق من هوية المشرف عبر Firebase ID Token (`RS256` عبر WebCrypto + JWKS) وفحص دوره من Claims أو Firestore `/admins/{uid}`.
- رفع مجزأ قابل للاستئناف (Multipart Upload بأجزاء 5 MB) للفيديوهات والكتب الكبيرة:
  - `POST /multipart/init`
  - `PUT /multipart/part`
  - `POST /multipart/complete`
  - `DELETE /multipart/abort`
- رفع مباشر مفرد للملفات حتى 20 MB (`POST /upload`) وجلب الحصة التخزينية (`GET /quota`) وحذف الملفات (`DELETE /object`).
- بث الملفات على HTTPS مع دعم `Accept-Ranges: bytes` و`206 Partial Content` لمشغل الفيديو `ExoPlayer` في Android و`Content-Type` الصحيح.

## خطوات النشر اليدوية
1. أنشئ Bucket على Cloudflare R2 باسم `midad-edu-media` (أو عدّل الاسم في `wrangler.toml`).
2. سجّل الدخول إلى Wrangler وأنشئ Worker ونفّذ النشر:
   ```bash
   cd cloudflare-worker
   npx wrangler login
   npx wrangler r2 bucket create midad-edu-media
   npx wrangler deploy
   ```
3. أضف رابط Worker (مثلاً `https://midad-r2-worker.<subdomain>.workers.dev`) داخل لوحة الإدارة -> **إعدادات المنصة والتخزين (Cloudflare R2)**.
4. عدّل `ALLOWED_ORIGINS` في `wrangler.toml` ليحتوي على رابط لوحة الإدارة الفعلي.
