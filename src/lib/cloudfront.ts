import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import fs from "fs";
import { getCachedUrl, setCachedUrl } from "@/lib/urlCache";

/** How long a signed URL is kept in the server-side cache (10 minutes).
 *  CloudFront URLs expire after 1 hour, so the 50-minute safety margin
 *  ensures cached URLs are always still valid when returned. */
const URL_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Resolves the CloudFront private key from one of two sources (checked in order):
 *
 *  1. CLOUDFRONT_PRIVATE_KEY_PATH — path to a .pem file on disk (best for local dev)
 *  2. CLOUDFRONT_PRIVATE_KEY      — inline value, either:
 *       • raw PEM with \n escaped as \\n  (docker-compose env vars)
 *       • base64-encoded PEM              (CI secrets / production env platforms)
 *
 * Returns null when neither is set.
 * Result is cached at module load time so the file/env is read only once per process.
 */
let _cachedPrivateKey: string | null | undefined = undefined;

function getPrivateKey(): string | null {
  if (_cachedPrivateKey !== undefined) return _cachedPrivateKey;

  // ── Option 1: file path ──────────────────────────────────────────────────
  const keyPath = process.env.CLOUDFRONT_PRIVATE_KEY_PATH;
  if (keyPath) {
    try {
      _cachedPrivateKey = fs.readFileSync(keyPath, "utf-8");
      return _cachedPrivateKey;
    } catch (err) {
      console.error("[cloudfront] Could not read key file at", keyPath, err);
      _cachedPrivateKey = null;
      return null;
    }
  }

  // ── Option 2: inline env var ─────────────────────────────────────────────
  const raw = process.env.CLOUDFRONT_PRIVATE_KEY;
  if (!raw) {
    _cachedPrivateKey = null;
    return null;
  }

  // Detect base64: a valid PEM always starts with "-----"
  if (!raw.trimStart().startsWith("-----")) {
    try {
      _cachedPrivateKey = Buffer.from(raw, "base64").toString("utf-8");
    } catch {
      _cachedPrivateKey = null;
    }
    return _cachedPrivateKey;
  }

  // Raw PEM stored with escaped newlines (common in .env files)
  _cachedPrivateKey = raw.replace(/\\n/g, "\n");
  return _cachedPrivateKey;
}

/**
 * Generates a CloudFront signed URL for a given S3 key.
 * Returns null when CloudFront is not fully configured.
 * Signed URLs expire in 1 hour.
 *
 * The RSA signing is CPU-bound and synchronous inside the AWS SDK.
 * We schedule it via setImmediate so the event loop can process other
 * callbacks between signing operations when many URLs are generated in
 * parallel with Promise.all.
 *
 * Pass `queryParams` to include resize/quality hints consumed by a
 * CloudFront image-transform function (Lambda@Edge or CloudFront Functions).
 * The params are signed into the URL so the signature covers them.
 */
async function buildSignedUrl(s3Key: string, queryParams?: Record<string, string | number>): Promise<string | null> {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = getPrivateKey();

  if (!domain || !keyPairId || !privateKey) return null;

  const qs = queryParams
    ? "?" + Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join("&")
    : "";

  // Cache key encodes both the S3 path and any query params so that
  // thumbnail (w=800) and lightbox (w=1920) URLs for the same file are
  // stored as separate entries and never returned for the wrong variant.
  const cacheKey = s3Key + qs;
  const cached = getCachedUrl(cacheKey);
  if (cached) return cached;

  const url = `https://${domain}/${s3Key}${qs}`;
  const dateLessThan = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const signed = getSignedUrl({ url, keyPairId, privateKey, dateLessThan });
        setCachedUrl(cacheKey, signed, URL_CACHE_TTL_MS);
        resolve(signed);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Original full-resolution signed URL.
 * Use ONLY for downloads — never for displaying images in the UI.
 */
export async function getCloudfrontSignedUrl(s3Key: string): Promise<string | null> {
  return buildSignedUrl(s3Key);
}

/**
 * Signed URL with resize query params for UI display.
 * The `w` and `q` params are passed to a CloudFront image-transform function
 * (Lambda@Edge / CloudFront Functions) that resizes on the fly.
 *
 * widthPx:  800  → grid thumbnails (masonry cards)
 * widthPx: 1920  → lightbox preview (large but not raw original)
 */
export async function getCloudfrontPreviewUrl(
  s3Key: string,
  widthPx: 800 | 1920 = 800,
  quality = widthPx === 800 ? 80 : 90,
): Promise<string | null> {
  return buildSignedUrl(s3Key, { w: widthPx, q: quality });
}
