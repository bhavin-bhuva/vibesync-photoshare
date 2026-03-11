import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import fs from "fs";

/**
 * Resolves the CloudFront private key from one of two sources (checked in order):
 *
 *  1. CLOUDFRONT_PRIVATE_KEY_PATH — path to a .pem file on disk (best for local dev)
 *  2. CLOUDFRONT_PRIVATE_KEY      — inline value, either:
 *       • raw PEM with \n escaped as \\n  (docker-compose env vars)
 *       • base64-encoded PEM              (CI secrets / production env platforms)
 *
 * Returns null when neither is set.
 */
function resolvePrivateKey(): string | null {
  // ── Option 1: file path ──────────────────────────────────────────────────
  const keyPath = process.env.CLOUDFRONT_PRIVATE_KEY_PATH;
  if (keyPath) {
    try {
      return fs.readFileSync(keyPath, "utf-8");
    } catch (err) {
      console.error("[cloudfront] Could not read key file at", keyPath, err);
      return null;
    }
  }

  // ── Option 2: inline env var ─────────────────────────────────────────────
  const raw = process.env.CLOUDFRONT_PRIVATE_KEY;
  if (!raw) return null;

  // Detect base64: a valid PEM always starts with "-----"
  if (!raw.trimStart().startsWith("-----")) {
    try {
      return Buffer.from(raw, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }

  // Raw PEM stored with escaped newlines (common in .env files)
  return raw.replace(/\\n/g, "\n");
}

/**
 * Generates a CloudFront signed URL for a given S3 key.
 * Returns null when CloudFront is not fully configured.
 * Signed URLs expire in 1 hour.
 */
export function getCloudfrontSignedUrl(s3Key: string): string | null {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = resolvePrivateKey();

  if (!domain || !keyPairId || !privateKey) return null;

  const url = `https://${domain}/${s3Key}`;
  const dateLessThan = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  try {
    return getSignedUrl({ url, keyPairId, privateKey, dateLessThan });
  } catch {
    return null;
  }
}
