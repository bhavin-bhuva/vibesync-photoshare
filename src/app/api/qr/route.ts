import { NextRequest, NextResponse } from "next/server";
import { generateQRCodeDataURL } from "@/lib/qrGenerator";

// Returns a QR code as a base64 data URL.
// Keeping qrcode server-side prevents its browser bundle from polluting
// the client module graph and breaking React 19 prerender.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const color = req.nextUrl.searchParams.get("color") ?? "#000000";
  const size = parseInt(req.nextUrl.searchParams.get("size") ?? "120", 10);

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const dataUrl = await generateQRCodeDataURL(url, { size, color });
    return new NextResponse(dataUrl, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "QR generation failed" }, { status: 500 });
  }
}
