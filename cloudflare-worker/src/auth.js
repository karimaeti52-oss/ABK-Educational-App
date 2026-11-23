const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const WRITE_STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'TEACHER']);

let cachedJwks = null;
let cachedJwksExpiresAt = 0;

function base64UrlToUint8Array(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonSegment(segment) {
  const bytes = base64UrlToUint8Array(segment);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchJwksKeys(fetchImpl = fetch) {
  const now = Date.now();
  if (cachedJwks && now < cachedJwksExpiresAt) {
    return cachedJwks;
  }
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google SecureToken JWKS (${res.status})`);
  }
  const data = await res.json();
  const cacheControl = res.headers?.get?.('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 300_000;
  cachedJwks = Array.isArray(data?.keys) ? data.keys : [];
  cachedJwksExpiresAt = now + Math.max(60_000, ttlMs);
  return cachedJwks;
}

export function clearJwksCacheForTests() {
  cachedJwks = null;
  cachedJwksExpiresAt = 0;
}

export async function verifyFirebaseIdToken(idToken, projectId, fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Firebase ID token');
  }
  const parts = idToken.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT algorithm or missing kid');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer || payload.aud !== projectId) {
    throw new Error('Token issuer or audience mismatch');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds - 30) {
    throw new Error('Firebase ID token expired');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + 300) {
    throw new Error('Invalid token issued-at timestamp');
  }

  const keys = await fetchJwksKeys(fetchImpl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Signing key not found in JWKS');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlToUint8Array(encodedSig);
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signingInput);
  if (!verified) {
    throw new Error('Invalid Firebase ID token signature');
  }

  return payload;
}

function unwrapFirestoreValue(field) {
  if (!field || typeof field !== 'object') return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('nullValue' in field) return null;
  return undefined;
}

function parseFirestoreDocument(docJson) {
  const fields = docJson?.fields;
  if (!fields || typeof fields !== 'object') return null;
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    out[key] = unwrapFirestoreValue(val);
  }
  return out;
}

export async function fetchFirestoreDocWithToken(env, idToken, docPath, fetchImpl = fetch) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const databaseId = env.FIREBASE_DATABASE_ID || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${docPath}`;
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore REST error (${res.status}) for ${docPath}`);
  }
  const json = await res.json();
  return parseFirestoreDocument(json);
}

export async function resolveStaffAuthorization(env, idToken, fetchImpl = fetch) {
  const payload = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID, fetchImpl);
  const email = String(payload.email || '').trim().toLowerCase();
  const emailVerified = Boolean(payload.email_verified);
  const superAdminEmail = String(env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();

  if (superAdminEmail && emailVerified && email === superAdminEmail) {
    return { uid: payload.sub, email, role: 'SUPER_ADMIN', authorized: true };
  }

  const claimRole = payload.abkRole;
  if (typeof claimRole === 'string' && WRITE_STAFF_ROLES.has(claimRole)) {
    return { uid: payload.sub, email, role: claimRole, authorized: true };
  }

  const adminDoc = await fetchFirestoreDocWithToken(env, idToken, `admins/${encodeURIComponent(payload.sub)}`, fetchImpl);
  if (adminDoc && adminDoc.active !== false) {
    const docRole = typeof adminDoc.role === 'string' ? adminDoc.role : 'ADMIN';
    if (WRITE_STAFF_ROLES.has(docRole)) {
      return { uid: payload.sub, email, role: docRole, authorized: true };
    }
  }

  return { uid: payload.sub, email, role: 'STUDENT', authorized: false };
}

export async function verifyReaderNotBanned(env, idToken, fetchImpl = fetch) {
  const payload = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID, fetchImpl);
  const email = String(payload.email || '').trim().toLowerCase();
  const superAdminEmail = String(env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (superAdminEmail && payload.email_verified && email === superAdminEmail) {
    return { uid: payload.sub, allowed: true, role: 'SUPER_ADMIN' };
  }

  // fetchFirestoreDocWithToken returns null cleanly when HTTP 404 (profile not yet created),
  // and throws on non-404 errors (5xx / network failure / permission denied) so caller fails CLOSED.
  const userDoc = await fetchFirestoreDocWithToken(env, idToken, `users/${encodeURIComponent(payload.sub)}`, fetchImpl);
  if (userDoc && (userDoc.accountStatus === 'BANNED' || userDoc.accountStatus === 'SUSPENDED')) {
    return { uid: payload.sub, allowed: false, reason: userDoc.accountStatus };
  }
  return { uid: payload.sub, allowed: true };
}
