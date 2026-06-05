import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { signShareToken } from "@/lib/share-token";

// Photographer-authenticated preview: sets the share cookie then redirects to
// /share/[slug] so the photographer can see the gallery without entering PIN.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { linkId } = await params;

  const link = await db.sharedLink.findFirst({
    where: { id: linkId, event: { userId: session.user.id } },
    select: { slug: true },
  });

  if (!link) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const token = signShareToken(link.slug);
  const dest = new URL(`/share/${link.slug}`, req.url);

  const res = NextResponse.redirect(dest);
  res.cookies.set(`share_${link.slug}`, token, {
    httpOnly: true,
    path: "/",
    maxAge: 24 * 60 * 60,
    sameSite: "lax",
  });

  return res;
}
