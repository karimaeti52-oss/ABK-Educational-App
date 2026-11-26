const encoder = new TextEncoder();

export function isValidB2Endpoint(endpoint) {
  const raw = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.pathname && parsed.pathname !== '/') return false;
    return /^s3\.[a-z0-9-]+\.backblazeb2\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function deriveB2RegionFromEndpoint(endpoint) {
  const raw = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const match = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(parsed.hostname);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

export function isValidB2BucketName(bucketName) {
  const clean = String(bucketName || '').trim();
  return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(clean) && !clean.includes('..');
}

export function isValidB2Region(region) {
  const clean = String(region || '').trim();
  return /^[a-z0-9-]{2,40}$/.test(clean);
}

export function resolveB2Config(env) {
  const endpoint = String(env?.B2_ENDPOINT || '').trim().replace(/\/+$/, '');
  const explicitRegion = String(env?.B2_REGION || '').trim();
  const region = explicitRegion || deriveB2RegionFromEndpoint(endpoint);
  const bucketName = String(env?.B2_BUCKET_NAME || '').trim();
  const accessKeyId = String(env?.B2_KEY_ID || '').trim();
  const secretAccessKey = String(env?.B2_APPLICATION_KEY || '').trim();
  const derivedRegion = deriveB2RegionFromEndpoint(endpoint);
  const regionMatchesEndpoint = !derivedRegion || derivedRegion === region.toLowerCase();
  const valid =
    isValidB2Endpoint(endpoint) &&
    isValidB2Region(region) &&
    regionMatchesEndpoint &&
    isValidB2BucketName(bucketName) &&
    accessKeyId.length > 0 &&
    secretAccessKey.length > 0;
  return { valid, endpoint, region, bucketName, accessKeyId, secretAccessKey };
}

export function hasB2Credentials(env) {
  return resolveB2Config(env).valid;
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeS3KeySegments(objectKey) {
  return String(objectKey)
    .split('/')
    .map((seg) => encodeRfc3986(seg))
    .join('/');
}

function toHex(bufferOrArray) {
  const bytes = bufferOrArray instanceof Uint8Array ? bufferOrArray : new Uint8Array(bufferOrArray);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

async function sha256Hex(data) {
  const bytes =
    typeof data === 'string'
      ? encoder.encode(data)
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(0);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

async function hmacSha256Raw(keyData, message) {
  const keyBytes = typeof keyData === 'string' ? encoder.encode(keyData) : new Uint8Array(keyData);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return new Uint8Array(sig);
}

async function deriveSigningKey(secretAccessKey, dateStamp, region, service = 's3') {
  const kDate = await hmacSha256Raw(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  return hmacSha256Raw(kService, 'aws4_request');
}

function formatAmzDate(date = new Date()) {
  const iso = date.toISOString();
  // 2026-11-22T10:30:00.000Z -> 20261122T103000Z + 20261122
  const amzDate = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function buildCanonicalQueryString(urlObj) {
  const pairs = [];
  for (const [k, v] of urlObj.searchParams.entries()) {
    pairs.push([encodeRfc3986(k), encodeRfc3986(v)]);
  }
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

export async function signS3Request({
  method,
  url,
  region,
  accessKeyId,
  secretAccessKey,
  headers = {},
  bodyBytes = new Uint8Array(0),
  now = new Date(),
}) {
  const urlObj = new URL(url);
  const { amzDate, dateStamp } = formatAmzDate(now);
  const payloadHash = await sha256Hex(bodyBytes);

  const normalizedHeaders = new Map();
  normalizedHeaders.set('host', urlObj.host);
  normalizedHeaders.set('x-amz-date', amzDate);
  normalizedHeaders.set('x-amz-content-sha256', payloadHash);

  for (const [rawKey, rawVal] of Object.entries(headers)) {
    if (rawVal === undefined || rawVal === null || rawVal === '') continue;
    const key = rawKey.trim().toLowerCase();
    const val = String(rawVal).trim().replace(/\s+/g, ' ');
    normalizedHeaders.set(key, val);
  }

  const sortedHeaderKeys = Array.from(normalizedHeaders.keys()).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${normalizedHeaders.get(k)}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalUri = urlObj.pathname || '/';
  const canonicalQuery = buildCanonicalQueryString(urlObj);

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, 's3');
  const signatureBytes = await hmacSha256Raw(signingKey, stringToSign);
  const signatureHex = toHex(signatureBytes);

  const finalHeaders = new Headers();
  for (const [k, v] of normalizedHeaders.entries()) {
    if (k === 'host') continue;
    finalHeaders.set(k, v);
  }
  finalHeaders.set(
    'Authorization',
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`
  );
  return finalHeaders;
}

export async function signS3PresignedGetUrl({
  url,
  region,
  accessKeyId,
  secretAccessKey,
  expiresInSec = 300,
  responseContentDisposition = '',
  now = new Date(),
}) {
  const urlObj = new URL(url);
  const { amzDate, dateStamp } = formatAmzDate(now);
  const clampedExpires = Math.min(3600, Math.max(30, Math.round(Number(expiresInSec) || 300)));
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  urlObj.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  urlObj.searchParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`);
  urlObj.searchParams.set('X-Amz-Date', amzDate);
  urlObj.searchParams.set('X-Amz-Expires', String(clampedExpires));
  urlObj.searchParams.set('X-Amz-SignedHeaders', 'host');
  if (responseContentDisposition) {
    urlObj.searchParams.set('response-content-disposition', responseContentDisposition);
  }

  const canonicalUri = urlObj.pathname || '/';
  const canonicalQuery = buildCanonicalQueryString(urlObj);
  const canonicalHeaders = `host:${urlObj.host}\n`;
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, 's3');
  const signatureBytes = await hmacSha256Raw(signingKey, stringToSign);
  const signatureHex = toHex(signatureBytes);

  urlObj.searchParams.set('X-Amz-Signature', signatureHex);
  return {
    signedUrl: urlObj.toString(),
    expiresInSec: clampedExpires,
    expiresAt: new Date(now.getTime() + clampedExpires * 1000).toISOString(),
  };
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractFirstTag(xml, tagName) {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = re.exec(xml);
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

export function parseListObjectsV2Xml(xmlText) {
  const contents = [];
  const blockRegex = /<Contents>([\s\S]*?)<\/Contents>/gi;
  let match;
  while ((match = blockRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const key = extractFirstTag(block, 'Key');
    const size = Number(extractFirstTag(block, 'Size') || 0);
    if (key) {
      contents.push({ key, size: Number.isFinite(size) ? size : 0 });
    }
  }
  const isTruncated = extractFirstTag(xmlText, 'IsTruncated').toLowerCase() === 'true';
  const nextContinuationToken = extractFirstTag(xmlText, 'NextContinuationToken') || null;
  return { contents, isTruncated, nextContinuationToken };
}

export function parseCreateMultipartXml(xmlText) {
  const uploadId = extractFirstTag(xmlText, 'UploadId');
  return { uploadId };
}

export function buildCompleteMultipartXml(parts) {
  const items = parts
    .map(
      (p) =>
        `<Part><PartNumber>${Number(p.partNumber)}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`
    )
    .join('');
  return `<CompleteMultipartUpload>${items}</CompleteMultipartUpload>`;
}

function normalizeMetadataHeaders(customMetadata = {}) {
  const out = {};
  if (customMetadata.accessLevel) out['x-amz-meta-access-level'] = String(customMetadata.accessLevel);
  if (customMetadata.mediaKind) out['x-amz-meta-media-kind'] = String(customMetadata.mediaKind);
  if (customMetadata.uploadedBy) out['x-amz-meta-uploaded-by'] = String(customMetadata.uploadedBy);
  if (customMetadata.originalName) out['x-amz-meta-original-name'] = String(customMetadata.originalName);
  return out;
}

export function createB2S3Client(env, fetchImpl = fetch) {
  const config = resolveB2Config(env);
  if (!config.valid) {
    throw new Error('Backblaze B2 S3 credentials are missing or invalid.');
  }
  const { endpoint, region, bucketName, accessKeyId, secretAccessKey } = config;

  async function signedFetch(method, url, { headers = {}, body = undefined } = {}) {
    let bodyBytes = new Uint8Array(0);
    if (typeof body === 'string') {
      bodyBytes = encoder.encode(body);
    } else if (body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(body);
    } else if (body instanceof Uint8Array) {
      bodyBytes = body;
    }

    const signedHeaders = await signS3Request({
      method,
      url,
      region,
      accessKeyId,
      secretAccessKey,
      headers,
      bodyBytes,
    });

    const sendBody =
      method === 'GET' || method === 'HEAD' || method === 'DELETE'
        ? undefined
        : bodyBytes.byteLength > 0
          ? bodyBytes
          : undefined;

    return fetchImpl(url, {
      method,
      headers: signedHeaders,
      body: sendBody,
    });
  }

  function objectUrl(objectKey, query = '') {
    return `${endpoint}/${encodeURIComponent(bucketName)}/${encodeS3KeySegments(objectKey)}${query}`;
  }

  return {
    async computeBucketUsage() {
      let continuationToken = null;
      let usedBytes = 0;
      let fileCount = 0;

      while (true) {
        const qs = new URLSearchParams({
          'list-type': '2',
          'max-keys': '1000',
        });
        if (continuationToken) {
          qs.set('continuation-token', continuationToken);
        }
        const listUrl = `${endpoint}/${encodeURIComponent(bucketName)}/?${qs.toString()}`;
        const res = await signedFetch('GET', listUrl);
        if (!res.ok) {
          throw new Error(`Backblaze B2 ListObjectsV2 failed (${res.status})`);
        }
        const xml = await res.text();
        const parsed = parseListObjectsV2Xml(xml);
        for (const item of parsed.contents) {
          usedBytes += item.size;
          fileCount += 1;
        }
        if (!parsed.isTruncated || !parsed.nextContinuationToken) {
          break;
        }
        continuationToken = parsed.nextContinuationToken;
      }

      return { usedBytes, fileCount };
    },

    async headObject(objectKey) {
      const res = await signedFetch('HEAD', objectUrl(objectKey));
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Backblaze B2 HeadObject failed (${res.status})`);
      }
      return {
        key: objectKey,
        size: Number(res.headers.get('content-length') || 0),
        httpMetadata: {
          contentType: res.headers.get('content-type') || 'application/octet-stream',
        },
        customMetadata: {
          accessLevel: res.headers.get('x-amz-meta-access-level') || '',
          mediaKind: res.headers.get('x-amz-meta-media-kind') || '',
          uploadedBy: res.headers.get('x-amz-meta-uploaded-by') || '',
          originalName: res.headers.get('x-amz-meta-original-name') || '',
        },
        etag: res.headers.get('etag') || undefined,
      };
    },

    async getObject(objectKey, rangeHeader = null) {
      const headers = {};
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }
      const res = await signedFetch('GET', objectUrl(objectKey), { headers });
      if (res.status === 404) return null;
      return res;
    },

    async putObject(objectKey, bodyBytes, opts = {}) {
      const contentType = opts?.httpMetadata?.contentType || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        ...normalizeMetadataHeaders(opts?.customMetadata),
      };
      const res = await signedFetch('PUT', objectUrl(objectKey), {
        headers,
        body: bodyBytes,
      });
      if (!res.ok) {
        throw new Error(`Backblaze B2 PutObject failed (${res.status})`);
      }
      return {
        key: objectKey,
        etag: res.headers.get('etag') || '',
      };
    },

    async createMultipartUpload(objectKey, opts = {}) {
      const contentType = opts?.httpMetadata?.contentType || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        ...normalizeMetadataHeaders(opts?.customMetadata),
      };
      const res = await signedFetch('POST', objectUrl(objectKey, '?uploads='), {
        headers,
      });
      if (!res.ok) {
        throw new Error(`Backblaze B2 CreateMultipartUpload failed (${res.status})`);
      }
      const xml = await res.text();
      const { uploadId } = parseCreateMultipartXml(xml);
      if (!uploadId) {
        throw new Error('Backblaze B2 CreateMultipartUpload response missing UploadId.');
      }
      return { key: objectKey, uploadId };
    },

    async uploadPart(objectKey, uploadId, partNumber, bodyBytes) {
      const query = `?partNumber=${encodeURIComponent(String(partNumber))}&uploadId=${encodeURIComponent(uploadId)}`;
      const res = await signedFetch('PUT', objectUrl(objectKey, query), {
        body: bodyBytes,
      });
      if (!res.ok) {
        throw new Error(`Backblaze B2 UploadPart failed (${res.status})`);
      }
      const etag = res.headers.get('etag') || '';
      if (!etag) {
        throw new Error('Backblaze B2 UploadPart missing ETag.');
      }
      return { partNumber, etag };
    },

    async completeMultipartUpload(objectKey, uploadId, parts) {
      const xmlBody = buildCompleteMultipartXml(parts);
      const query = `?uploadId=${encodeURIComponent(uploadId)}`;
      const res = await signedFetch('POST', objectUrl(objectKey, query), {
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });
      if (!res.ok) {
        throw new Error(`Backblaze B2 CompleteMultipartUpload failed (${res.status})`);
      }
      const responseXml = await res.text();
      if (/<Error>/i.test(responseXml)) {
        const errCode = extractFirstTag(responseXml, 'Code') || 'CompleteMultipartError';
        const errMessage = extractFirstTag(responseXml, 'Message') || 'Backblaze B2 rejected multipart completion.';
        throw new Error(`Backblaze B2 CompleteMultipartUpload error (${errCode}): ${errMessage}`);
      }
      const head = await this.headObject(objectKey);
      if (!head || Number(head.size || 0) <= 0) {
        throw new Error('Backblaze B2 CompleteMultipartUpload verification failed: object missing or empty.');
      }
      return head;
    },

    async abortMultipartUpload(objectKey, uploadId) {
      const query = `?uploadId=${encodeURIComponent(uploadId)}`;
      const res = await signedFetch('DELETE', objectUrl(objectKey, query));
      if (!res.ok && res.status !== 404) {
        throw new Error(`Backblaze B2 AbortMultipartUpload failed (${res.status})`);
      }
      return true;
    },

    async deleteObject(objectKey) {
      const res = await signedFetch('DELETE', objectUrl(objectKey));
      if (!res.ok && res.status !== 404) {
        throw new Error(`Backblaze B2 DeleteObject failed (${res.status})`);
      }
      return true;
    },

    async getPresignedGetUrl(objectKey, { expiresInSec = 300, responseContentDisposition = '' } = {}) {
      return signS3PresignedGetUrl({
        url: objectUrl(objectKey),
        region,
        accessKeyId,
        secretAccessKey,
        expiresInSec,
        responseContentDisposition,
      });
    },
  };
}
