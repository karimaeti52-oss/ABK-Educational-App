#!/usr/bin/env node
import { FieldValue } from 'firebase-admin/firestore';
import { loadConfig } from '../config.js';
import { initFirebaseAdmin } from '../firebaseAdmin.js';
import {
  grantAdminAccount,
  parseAdminCliArgs,
  verifyAdminAccountState,
} from '../adminCliCore.js';

function printUsage() {
  console.log(`
الاستخدام (Firebase Admin SDK CLI):
  node server/scripts/manageAdminAccount.js --verify --email <admin-email>
  node server/scripts/manageAdminAccount.js --grant  --email <admin-email> --role SUPER_ADMIN

الخيارات:
  --verify             فحص الحالة الحالية فقط بدون أي تعديل (Read-only)
  --grant              منح Custom Claims + /admins/{uid} بأمان عبر Firebase Admin SDK
  --email <email>      البريد الإلكتروني للحساب الإداري
  --uid <uid>          معرف المستخدم UID (بديل عن البريد الإلكتروني)
  --role <role>        الدور المطلوب (افتراضي: SUPER_ADMIN)
  --json               طباعة النتيجة بصيغة JSON فقط
  --help               عرض هذه الرسالة

ملاحظة المصادقة:
  يستخدم FIREBASE_SERVICE_ACCOUNT_FILE أو FIREBASE_SERVICE_ACCOUNT_JSON أو GOOGLE_APPLICATION_CREDENTIALS.
`);
}

async function main() {
  const args = parseAdminCliArgs(process.argv.slice(2));
  if (args.help || !args.mode) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }
  if (!args.email && !args.uid) {
    console.error('خطأ: يجب تمرير --email أو --uid.');
    printUsage();
    process.exit(1);
  }

  const config = loadConfig();
  const { auth, db } = initFirebaseAdmin(config);

  const report =
    args.mode === 'verify'
      ? await verifyAdminAccountState({
          auth,
          db,
          config,
          email: args.email,
          uid: args.uid,
        })
      : await grantAdminAccount({
          auth,
          db,
          FieldValue,
          config,
          email: args.email,
          uid: args.uid,
          role: args.role,
          allowUnverified: args.allowUnverified,
        });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== تقرير صلاحيات الحساب الإداري (Firebase Admin SDK) ===');
    console.log(`المشروع: ${report.projectId} | قاعدة البيانات: ${report.databaseId}`);
    console.log(`UID: ${report.uid} | البريد: ${report.email} | موثق: ${report.emailVerified}`);
    console.log(`Custom Claims -> abkRole: ${report.customClaims.abkRole || 'غير مضبوط'}`);
    console.log(`/admins/${report.uid} -> موجود: ${report.adminsDoc.exists} | نشط: ${report.adminsDoc.active} | الدور: ${report.adminsDoc.role || 'غير مضبوط'}`);
    console.log(`عدد المسؤولين الفعالين في /admins: ${report.counts.activeAdminCount} (SUPER_ADMIN: ${report.counts.activeSuperAdminCount})`);
    console.log(`جاهزية Firestore Rules: ${report.checks.readyForFirestore ? 'جاهز' : 'غير جاهز'}`);
    console.log(`جاهزية Storage Rules: ${report.checks.readyForStorage ? 'جاهز' : 'غير جاهز (يتطلب abkRole Claim)'}`);
    console.log(`جاهزية الإدارة الكاملة: ${report.checks.readyForFullAdmin ? 'جاهز' : 'غير مكتمل'}`);
    if (args.mode === 'grant') {
      console.log('تنبيه: يجب تسجيل الخروج وإعادة تسجيل الدخول (أو تحديث ID Token) لتفعيل Custom Claims الجديدة في الجلسة.');
    }
  }

  if (!report.checks.readyForFullAdmin) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('فشل تنفيذ أداة الإدارة:', err?.message || err);
  process.exit(1);
});
