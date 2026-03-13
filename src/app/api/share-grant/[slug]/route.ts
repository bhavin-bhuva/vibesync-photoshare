import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signShareToken } from "@/lib/share-token";

/**
 * GET /api/share-grant/[slug]
 *
 * Sets the share access cookie for NONE-protected links and redirects
 * to the gallery. This route handler is the only way to set a cookie
 * from a server-side redirect (Server Components cannot write cookies).
 *
 * Guards:
 * - Link must exist and have accessType === "NONE"
 * - Link must not be expired
 * - Suspended photographer links are allowed through here (the gallery
 *   page will display the unavailable message after the redirect)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const galleryUrl = new URL(`/share/${slug}`, req.url);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await db.sharedLink.findUnique({
    where: { slug },
    select: { expiresAt: true, accessType: true } as any,
  }) as { expiresAt: Date | null; accessType: string } | null;

  // If the link doesn't exist, is not NONE type, or is expired, just
  // redirect back to the gallery — it will handle those states itself.
  if (
    !link ||
    link.accessType !== "NONE" ||
    (link.expiresAt && new Date() > link.expiresAt)
  ) {
    return NextResponse.redirect(galleryUrl);
  }

  const token = signShareToken(slug);
  const response = NextResponse.redirect(galleryUrl);
  response.cookies.set(`share_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });
  return response;
}
