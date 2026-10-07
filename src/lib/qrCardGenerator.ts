import sharp from "sharp";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import { generateQRCode } from "./qrGenerator";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Business card at 300dpi: 85mm × 54mm
const CARD_W = 1004;
const CARD_H = 638;

export interface QRCardParams {
  galleryUrl: string;
  eventTitle: string;
  studioName: string;
  studioLogoS3Key?: string;
  pin?: string;
  showPin: boolean;
  customMessage?: string;
  brandColor: string; // hex e.g. #FF5733
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function buildCardSvg(params: QRCardParams, logoRenderedHeight: number): Buffer {
  const { studioName, eventTitle, customMessage, pin, showPin, brandColor } =
    params;
  const x = (s: string) => escapeXml(s);
  const { r, g, b } = hexToRgb(brandColor);

  // Vertical text positions — shift down when logo is present
  const logoBottom = logoRenderedHeight > 0 ? 80 + logoRenderedHeight + 24 : 64;
  const studioNameY = logoBottom + 32;
  const eventTitleY = studioNameY + 56;
  const customMsgY = eventTitleY + 52;
  const pinY = customMsgY + (customMessage ? 48 : 8);
  // "Scan to view your photos" pushed to lower third of card
  const scanY = Math.max(pinY + (showPin && pin ? 72 : 16), CARD_H - 88);

  const msgEl = customMessage
    ? `<text
        x="60" y="${customMsgY}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="18" fill="#6b7280"
      >${x(customMessage)}</text>`
    : "";

  const pinEl =
    showPin && pin
      ? `<rect x="60" y="${pinY}" width="208" height="48" rx="24" fill="${brandColor}"/>
         <text y="${pinY + 31}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="white">
           <tspan x="80" font-size="13" fill-opacity="0.8">PIN </tspan><tspan font-family="Courier New, Courier, monospace" font-size="22" font-weight="700">${x(pin)}</tspan>
         </text>`
      : "";

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
  <!-- Divider -->
  <line x1="580" y1="40" x2="580" y2="${CARD_H - 40}"
    stroke="rgba(${r},${g},${b},0.3)" stroke-width="1.5"/>

  <!-- Studio name -->
  <text
    x="60" y="${studioNameY}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="26" font-weight="700" fill="#111827"
  >${x(studioName)}</text>

  <!-- Event title -->
  <text
    x="60" y="${eventTitleY}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="38" font-weight="700" fill="#1f2937"
  >${x(eventTitle)}</text>

  ${msgEl}
  ${pinEl}

  <!-- Scan instruction -->
  <text
    x="60" y="${scanY}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="18" fill="#9ca3af"
  >Scan to view your photos</text>

  <!-- Footer branding — centred across full card -->
  <text
    x="${CARD_W / 2}" y="${CARD_H - 20}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="14" fill="#d1d5db" text-anchor="middle"
  >photohouse.in</text>

  <!-- QR panel label -->
  <text
    x="${580 + (CARD_W - 580) / 2}" y="${CARD_H - 20}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="13" fill="#9ca3af" text-anchor="middle"
  >Your Gallery</text>
</svg>`);
}

export async function generateQRCard(params: QRCardParams): Promise<Buffer> {
  const { galleryUrl, studioLogoS3Key, brandColor } = params;

  // White base canvas
  const base = sharp({
    create: {
      width: CARD_W,
      height: CARD_H,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // QR code using brand color for modules
  const qrBuffer = await generateQRCode(galleryUrl, {
    size: 320,
    color: brandColor,
    margin: 1,
  });

  // Brand color bottom strip (8px, full width) via SVG rect
  const stripSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
      <rect x="0" y="${CARD_H - 8}" width="${CARD_W}" height="8" fill="${brandColor}"/>
    </svg>`
  );

  const composites: sharp.OverlayOptions[] = [];
  let logoRenderedHeight = 0;

  // Logo from S3 — resize to max 120px tall, maintain aspect ratio
  if (studioLogoS3Key) {
    try {
      const { Body } = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: studioLogoS3Key,
        })
      );
      const raw = await streamToBuffer(Body as Readable);
      const resized = await sharp(raw)
        .resize(undefined, 120, { fit: "inside" })
        .png()
        .toBuffer({ resolveWithObject: true });

      logoRenderedHeight = resized.info.height;
      composites.push({ input: resized.data, top: 80, left: 60 });
    } catch {
      // S3 fetch failed — continue without logo
    }
  }

  // SVG text overlay (built after logo so Y positions are correct)
  const svgOverlay = buildCardSvg(params, logoRenderedHeight);

  // QR: centred in right panel (x:580–1004, y centred)
  composites.push(
    { input: stripSvg, top: 0, left: 0 },
    { input: svgOverlay, top: 0, left: 0 },
    { input: qrBuffer, top: 159, left: 624 }
  );

  return base.composite(composites).png({ compressionLevel: 6 }).toBuffer();
}

// A4 at 300dpi: 2480×3508px — fits 6 cards (2 cols × 3 rows) with 8px gaps
export async function generateA4Sheet(cards: QRCardParams[]): Promise<Buffer> {
  const COLS = 2;
  const ROWS = 3;
  const GAP = 8;
  const A4_W = 2480;
  const A4_H = 3508;

  const totalW = COLS * CARD_W + (COLS - 1) * GAP;
  const totalH = ROWS * CARD_H + (ROWS - 1) * GAP;
  const marginX = Math.round((A4_W - totalW) / 2);
  const marginY = Math.round((A4_H - totalH) / 2);

  const sheet = sharp({
    create: {
      width: A4_W,
      height: A4_H,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const slots = Math.min(cards.length, COLS * ROWS);

  const composites = await Promise.all(
    Array.from({ length: slots }, async (_, i): Promise<sharp.OverlayOptions> => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cardBuf = await generateQRCard(cards[i]);
      return {
        input: cardBuf,
        top: marginY + row * (CARD_H + GAP),
        left: marginX + col * (CARD_W + GAP),
      };
    })
  );

  return sheet.composite(composites).png({ compressionLevel: 6 }).toBuffer();
}
