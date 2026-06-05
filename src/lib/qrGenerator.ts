// Server-only QR code generation using qrcode-generator (no browser field →
// no prerender context pollution) + sharp (SVG-to-PNG).
// qrcode npm package was replaced to fix Next.js 16 /_global-error prerender bug
// caused by qrcode's pngjs browser bundle.

import sharp from "sharp";
import qrcodeGenerator from "qrcode-generator";

function buildQrSvg(url: string, color: string, size: number): string {
  const qr = qrcodeGenerator(0, "H");
  qr.addData(url);
  qr.make();

  const n = qr.getModuleCount();
  const margin = Math.max(1, Math.floor(size * 0.04)); // ~4% margin
  const innerSize = size - margin * 2;
  const cell = innerSize / n;

  let rects = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) {
        const x = margin + col * cell;
        const y = margin + row * cell;
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="white"/>
  <g fill="${color}">${rects}</g>
</svg>`;
}

export async function generateQRCode(
  url: string,
  options?: {
    size?: number
    color?: string
    bgColor?: string
    margin?: number
  }
): Promise<Buffer> {
  const size = options?.size ?? 300;
  const color = options?.color ?? "#000000";
  const svg = buildQrSvg(url, color, size);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function generateQRCodeDataURL(
  url: string,
  options?: { size?: number; color?: string }
): Promise<string> {
  const buf = await generateQRCode(url, options);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
