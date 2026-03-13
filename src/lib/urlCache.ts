/**
 * In-memory server-side cache for CloudFront signed URLs.
 *
 * Signed URLs are valid for 1 hour. We cache them for 10 minutes so that
 * revisiting the same event page within that window costs zero RSA signing
 * operations. The 50-minute safety margin means a cached URL is always well
 * within its CloudFront expiry when served from this cache.
 *
 * The cache is process-scoped (module singleton). In a multi-instance
 * deployment each instance maintains its own cache independently, which is
 * fine — cache misses just result in a signing operation, not an error.
 */

const cache = new Map<string, { url: string; expiresAt: number }>();

export function getCachedUrl(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.url;
}

export function setCachedUrl(key: string, url: string, ttlMs: number): void {
  cache.set(key, { url, expiresAt: Date.now() + ttlMs });
}
