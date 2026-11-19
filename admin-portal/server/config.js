import dotenv from 'dotenv';
dotenv.config();

export function loadConfig(env = process.env) {
  const allowedOrigins = (env.ADMIN_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 8787),
    projectId: env.FIREBASE_PROJECT_ID || 'gen-lang-client-0343268738',
    databaseId:
      env.FIREBASE_FIRESTORE_DATABASE_ID ||
      'ai-studio-android-abk-452af8d1-cf14-40e7-aead-48a40e7f239d',
    superAdminEmail: (env.SUPER_ADMIN_EMAIL || 'karimaeti07@gmail.com').toLowerCase(),
    serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountFile: env.FIREBASE_SERVICE_ACCOUNT_FILE || '',
    allowedOrigins,
    enforceAppCheck: env.ENFORCE_APP_CHECK === 'true',
    sensitiveAuthMaxAgeSeconds: Number(env.SENSITIVE_AUTH_MAX_AGE_SECONDS || 1800),
  };
}
