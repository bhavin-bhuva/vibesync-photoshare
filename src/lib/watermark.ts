import sharp from "sharp";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

// ─── S3 client (standalone — not imported from s3.ts which is "use server") ──

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type WatermarkPosition = "BOTTOM_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_CENTER";

export interface WatermarkProfile {
  studioName: string;
  logoS3Key?: string | null;
  watermarkEnabled?: boolean;
  watermarkPosition?: WatermarkPosition;
  watermarkOpacity?: number; // 10–80 (%)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Text watermark ───────────────────────────────────────────────────────────

function buildTextWatermarkSvg(
  text: string,
  imgWidth: number,
  imgHeight: number,
  position: WatermarkPosition,
  opacity: number
): Buffer {
  const fontSize = Math.max(14, Math.round(imgWidth * 0.03));
  const padding = Math.round(fontSize * 1.2);
  const fillOpacity = (Math.min(80, Math.max(10, opacity)) / 100).toFixed(2);
  const safe = escapeXml(text);

  const [x, anchor] =
    position === "BOTTOM_LEFT"   ? [padding,            "start" ] :
    position === "BOTTOM_CENTER" ? [imgWidth / 2,        "middle"] :
                                   [imgWidth - padding,  "end"   ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
  <defs>
    <filter id="shadow">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="black" flood-opacity="0.6"/>
    </filter>
  </defs>
  <text
    x="${x}"
    y="${imgHeight - padding}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="white"
    fill-opacity="${fillOpacity}"
    text-anchor="${anchor}"
    filter="url(#shadow)"
  >${safe}</text>
</svg>`;

  return Buffer.from(svg);
}

// ─── Logo watermark ───────────────────────────────────────────────────────────

async function buildLogoWatermark(
  logoKey: string,
  imgWidth: number,
  imgHeight: number,
  position: WatermarkPosition,
  opacity: number
): Promise<sharp.OverlayOptions> {
  const { Body } = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: logoKey,
    })
  );

  const logoBuffer = await streamToBuffer(Body as Readable);

  const logoSize = Math.min(160, Math.max(60, Math.round(imgWidth * 0.08)));
  const padding = Math.round(logoSize * 0.3);
  const alphaScale = Math.min(80, Math.max(10, opacity)) / 100;

  const resized = await sharp(logoBuffer)
    .resize(logoSize, logoSize, { fit: "inside" })
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * alphaScale);
  }

  const semiTransparent = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const top = imgHeight - info.height - padding;
  const left =
    position === "BOTTOM_LEFT"   ? padding :
    position === "BOTTOM_CENTER" ? Math.round((imgWidth - info.width) / 2) :
                                   imgWidth - info.width - padding;

  return { input: semiTransparent, top, left };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Composites a watermark onto the given image buffer.
 * Respects watermarkEnabled, watermarkPosition, and watermarkOpacity from the profile.
 * Returns the watermarked image as a JPEG buffer.
 */
export async function applyWatermark(
  imageBuffer: Buffer,
  profile: WatermarkProfile
): Promise<Buffer> {
  // Honour the enabled flag (default true for backwards-compat)
  if (profile.watermarkEnabled === false) return imageBuffer;

  const position: WatermarkPosition = profile.watermarkPosition ?? "BOTTOM_RIGHT";
  const opacity = Math.min(80, Math.max(10, profile.watermarkOpacity ?? 55));

  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width ?? 1920;
  const imgHeight = metadata.height ?? 1080;

  let overlay: sharp.OverlayOptions;

  if (profile.logoS3Key) {
    try {
      overlay = await buildLogoWatermark(profile.logoS3Key, imgWidth, imgHeight, position, opacity);
    } catch {
      overlay = {
        input: buildTextWatermarkSvg(profile.studioName, imgWidth, imgHeight, position, opacity),
        top: 0,
        left: 0,
      };
    }
  } else {
    overlay = {
      input: buildTextWatermarkSvg(profile.studioName, imgWidth, imgHeight, position, opacity),
      top: 0,
      left: 0,
    };
  }

  return sharp(imageBuffer)
    .composite([overlay])
    .jpeg({ quality: 90 })
    .toBuffer();
}
