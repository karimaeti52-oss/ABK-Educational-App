import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

function parseServiceAccountCredentials(rawJson, sourceLabel) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson.trim());
  } catch {
    throw new Error(`Invalid Firebase service account JSON provided via ${sourceLabel}.`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.client_email !== 'string' ||
    typeof parsed.private_key !== 'string'
  ) {
    throw new Error(`Incomplete Firebase service account credentials provided via ${sourceLabel}.`);
  }
  return parsed;
}

export function initFirebaseAdmin(config) {
  if (!admin.apps.length) {
    const rawJson = (config.serviceAccountJson || '').trim();
    const secretFile = (config.serviceAccountFile || '').trim();

    if (rawJson) {
      // Loaded at runtime from Google Secret Manager env injection (FIREBASE_SERVICE_ACCOUNT_JSON)
      const parsed = parseServiceAccountCredentials(rawJson, 'FIREBASE_SERVICE_ACCOUNT_JSON');
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
        projectId: config.projectId || parsed.project_id,
      });
    } else if (secretFile && fs.existsSync(secretFile)) {
      // Loaded at runtime from Secret Manager volume mount
      const fileRaw = fs.readFileSync(secretFile, 'utf8');
      const parsed = parseServiceAccountCredentials(fileRaw, 'FIREBASE_SERVICE_ACCOUNT_FILE');
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
        projectId: config.projectId || parsed.project_id,
      });
    } else {
      // Uses Cloud Run Runtime Service Account (Application Default Credentials)
      admin.initializeApp({
        projectId: config.projectId,
      });
    }
  }

  const app = admin.app();
  const auth = admin.auth(app);
  const db = getFirestore(app, config.databaseId);
  const appCheck = admin.appCheck(app);

  return { app, auth, db, appCheck, admin };
}
