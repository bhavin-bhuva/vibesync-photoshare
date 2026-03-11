import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Creates a signed token that proves the bearer has verified the password
 * for the given slug. Format: `slug|exp|hmac`
 */
export function signShareToken(slug: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${slug}|${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}|${sig}`;
}

/**
 * Returns true when the token was produced by signShareToken for this slug
 * and has not expired.
 */
export function verifyShareToken(slug: string, token: string): boolean {
  const parts = token.split("|");
  if (parts.length !== 3) return false;

  const [tokenSlug, expStr, sig] = parts;
  if (tokenSlug !== slug) return false;

  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Date.now() > exp) return false;

  const expected = createHmac("sha256", SECRET)
    .update(`${tokenSlug}|${expStr}`)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
