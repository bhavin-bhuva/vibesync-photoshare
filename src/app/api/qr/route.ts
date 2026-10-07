import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateQRCodeDataURL } from "@/lib/qrGenerator";

const MIN_SIZE = 32;
const MAX_SIZE = 1024;
const MAX_URL_LENGTH = 2048;

// Returns a QR code as a base64 data URL.
// Keeping qrcode server-side prevents its browser bundle from polluting
// the client module graph and breaking React 19 prerender.
// Photographer-only: used by the QR card preview in event settings.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  const color = req.nextUrl.searchParams.get("color") ?? undefined;
  const size = parseInt(req.nextUrl.searchParams.get("size") ?? "120", 10);

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }
  if (url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ error: "url is too long" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size < MIN_SIZE || size > MAX_SIZE) {
    return NextResponse.json({ error: `size must be between ${MIN_SIZE} and ${MAX_SIZE}` }, { status: 400 });
  }

  try {
    const dataUrl = await generateQRCodeDataURL(url, { size, color });
    return new NextResponse(dataUrl, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "private, max-age=3600, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "QR generation failed" }, { status: 500 });
  }
}
