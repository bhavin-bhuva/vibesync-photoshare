/**
 * Seed realistic documentation data for Puppeteer screenshots.
 * Creates a STUDIO photographer with 3 events, placeholder photos,
 * photo groups, shared links, and customer selections.
 *
 * Usage:
 *   npm run seed:docs
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { randomBytes } from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

const COLORS = [
  "#667eea", "#f093fb", "#4facfe",
  "#43e97b", "#fa709a", "#a18cd1", "#ffecd2",
  "#a1c4fd", "#fd7043", "#26c6da", "#ec407a", "#7e57c2",
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

async function generateJpeg(color: string): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: hexToRgb(color) },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function uploadToS3(key: string, buffer: Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: "image/jpeg",
    })
  );
}

// ─── Counters ─────────────────────────────────────────────────────────────────

let totalPhotos         = 0;
let totalStorageBytes   = 0;
let totalGroups         = 0;
let totalSharedLinks    = 0;
let totalSelections     = 0;
let totalSelectedPhotos = 0;

async function main() {
  // ── 1. Photographer account ───────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("DocsTest@123", 12);

  const user = await db.user.upsert({
    where:   { email: "docs@photohouse.test" },
    update:  {
      passwordHash,
      name: "Arjun Sharma Photography",
      storageLimit: BigInt(500 * 1024 ** 3),
    },
    create:  {
      email:        "docs@photohouse.test",
      passwordHash,
      name:         "Arjun Sharma Photography",
      storageLimit: BigInt(500 * 1024 ** 3),
      subscription: {
        create: {
          stripeCustomerId: "cus_docs_placeholder",
          planTier:         "STUDIO",
          status:           "active",
        },
      },
      studioProfile: {
        create: {
          studioName:        "Arjun Sharma Photography",
          tagline:           "Capturing moments forever",
          brandColor:        "#6366F1",
          watermarkEnabled:  true,
          watermarkPosition: "BOTTOM_RIGHT",
          watermarkOpacity:  55,
        },
      },
    },
    include: { subscription: true, studioProfile: true },
  });

  // Upsert doesn't create nested relations — ensure studioProfile exists
  if (!user.studioProfile) {
    await db.studioProfile.upsert({
      where:  { userId: user.id },
      update: { studioName: "Arjun Sharma Photography", tagline: "Capturing moments forever", brandColor: "#6366F1" },
      create: {
        userId:            user.id,
        studioName:        "Arjun Sharma Photography",
        tagline:           "Capturing moments forever",
        brandColor:        "#6366F1",
        watermarkEnabled:  true,
        watermarkPosition: "BOTTOM_RIGHT",
        watermarkOpacity:  55,
      },
    });
  }

  console.log(`✓ User:         ${user.email} (${user.id})`);
  console.log(`✓ Plan:         STUDIO`);
  console.log(`✓ Studio:       Arjun Sharma Photography`);

  // ── Helper: generate JPEG, upload, insert Photo row ──────────────────────

  async function createPhoto(
    eventId: string,
    colorIdx: number,
    groupId?: string
  ): Promise<void> {
    const color   = COLORS[colorIdx % COLORS.length];
    const buffer  = await generateJpeg(color);
    const ts      = Date.now() + colorIdx; // ensure unique timestamps
    const key     = `photographers/${user.id}/events/${eventId}/${ts}-photo-${colorIdx + 1}.jpg`;

    await uploadToS3(key, buffer);

    await db.photo.create({
      data: {
        s3Key:    key,
        filename: `photo-${colorIdx + 1}.jpg`,
        size:     buffer.length,
        width:    800,
        height:   600,
        status:   "READY",
        eventId,
        ...(groupId ? { groupId } : {}),
      },
    });

    totalPhotos++;
    totalStorageBytes += buffer.length;
  }

  // ── 2. Event 1: Sharma Wedding 2024 ──────────────────────────────────────

  const event1 = await db.event.upsert({
    where:  { id: "docs-event-wedding-2024" },
    update: {},
    create: {
      id:     "docs-event-wedding-2024",
      name:   "Sharma Wedding 2024",
      date:   new Date("2024-12-14"),
      userId: user.id,
    },
  });
  console.log(`\n✓ Event 1:      ${event1.name}`);

  // Delete existing photos so re-runs don't double up
  const oldPhotos1 = await db.photo.findMany({
    where:  { eventId: event1.id },
    select: { id: true },
  });
  if (oldPhotos1.length === 0) {
    // Groups
    const ceremonyGroup = await db.photoGroup.create({
      data: { name: "Ceremony", color: "#6366f1", eventId: event1.id, sortOrder: 0 },
    });
    const receptionGroup = await db.photoGroup.create({
      data: { name: "Reception", color: "#f59e0b", eventId: event1.id, sortOrder: 1 },
    });
    totalGroups += 2;

    for (let i = 0; i < 8;  i++) await createPhoto(event1.id, i,      ceremonyGroup.id);
    for (let i = 8; i < 12; i++) await createPhoto(event1.id, i, receptionGroup.id);

    await db.photoGroup.update({ where: { id: ceremonyGroup.id  }, data: { photoCount: 8 } });
    await db.photoGroup.update({ where: { id: receptionGroup.id }, data: { photoCount: 4 } });
    console.log(`  Photos:       12 (8 Ceremony + 4 Reception)`);

    // Shared link — PIN 1234
    const weddingSlug    = randomBytes(8).toString("hex");
    const weddingPinHash = await bcrypt.hash("1234", 10);
    const weddingLink = await db.sharedLink.create({
      data: {
        slug:       weddingSlug,
        accessType: "PIN",
        pin:        weddingPinHash,
        pinPlain:   "1234",
        eventId:    event1.id,
      },
    });
    totalSharedLinks++;
    console.log(`  Shared link:  /share/${weddingSlug} (PIN: 1234)`);

    // 2 photo selections
    const photos1 = await db.photo.findMany({
      where:  { eventId: event1.id },
      select: { id: true },
      take:   6,
    });

    await db.photoSelection.create({
      data: {
        customerName:  "Priya Sharma",
        customerEmail: "priya.sharma@example.com",
        customerNote:  "I love the ceremony shots! Please keep photos 1–3.",
        sharedLinkId:  weddingLink.id,
        selectedPhotos: {
          create: photos1.slice(0, 3).map((p) => ({ photoId: p.id })),
        },
      },
    });
    totalSelections++;
    totalSelectedPhotos += 3;

    await db.photoSelection.create({
      data: {
        customerName:  "Rahul Sharma",
        customerEmail: "rahul.sharma@example.com",
        sharedLinkId:  weddingLink.id,
        selectedPhotos: {
          create: photos1.slice(3, 6).map((p) => ({ photoId: p.id })),
        },
      },
    });
    totalSelections++;
    totalSelectedPhotos += 3;

    await db.event.update({
      where: { id: event1.id },
      data:  { hasNewSelections: true },
    });

    console.log(`  Selections:   2 (Priya: 3 photos, Rahul: 3 photos)`);
  } else {
    console.log(`  Skipped (already seeded — ${oldPhotos1.length} photos exist)`);
  }

  // ── 3. Event 2: Corporate Headshots ──────────────────────────────────────

  const event2 = await db.event.upsert({
    where:  { id: "docs-event-techcorp-2024" },
    update: {},
    create: {
      id:     "docs-event-techcorp-2024",
      name:   "Corporate Headshots — TechCorp",
      date:   new Date("2024-11-20"),
      userId: user.id,
    },
  });
  console.log(`\n✓ Event 2:      ${event2.name}`);

  const oldPhotos2 = await db.photo.findMany({
    where:  { eventId: event2.id },
    select: { id: true },
  });
  if (oldPhotos2.length === 0) {
    for (let i = 0; i < 6; i++) await createPhoto(event2.id, i);

    const techcorpSlug     = randomBytes(8).toString("hex");
    const techcorpPassHash = await bcrypt.hash("techcorp2024", 10);
    await db.sharedLink.create({
      data: {
        slug:         techcorpSlug,
        accessType:   "PASSWORD",
        passwordHash: techcorpPassHash,
        eventId:      event2.id,
      },
    });
    totalSharedLinks++;
    console.log(`  Photos:       6`);
    console.log(`  Shared link:  /share/${techcorpSlug} (password: techcorp2024)`);
  } else {
    console.log(`  Skipped (already seeded — ${oldPhotos2.length} photos exist)`);
  }

  // ── 4. Event 3: Patel Family Portrait ────────────────────────────────────

  const event3 = await db.event.upsert({
    where:  { id: "docs-event-patel-2024" },
    update: {},
    create: {
      id:     "docs-event-patel-2024",
      name:   "Patel Family Portrait",
      date:   new Date("2024-12-01"),
      userId: user.id,
    },
  });
  console.log(`\n✓ Event 3:      ${event3.name}`);

  const oldPhotos3 = await db.photo.findMany({
    where:  { eventId: event3.id },
    select: { id: true },
  });
  if (oldPhotos3.length === 0) {
    for (let i = 0; i < 4; i++) await createPhoto(event3.id, i);
    console.log(`  Photos:       4`);
    console.log(`  Shared link:  none`);
  } else {
    console.log(`  Skipped (already seeded — ${oldPhotos3.length} photos exist)`);
  }

  // ── 5. Docs admin account ─────────────────────────────────────────────────

  const adminHash = await bcrypt.hash("AdminDocs@123", 12);
  const docsAdmin = await db.user.upsert({
    where:  { email: "admin@photohouse.test" },
    update: { passwordHash: adminHash },
    create: {
      email:        "admin@photohouse.test",
      passwordHash: adminHash,
      name:         "Docs Admin",
      role:         "SUPER_ADMIN",
    },
  });
  console.log(`\n✓ Docs admin:   ${docsAdmin.email} (${docsAdmin.id})`);

  // ── 6. Sync storage ───────────────────────────────────────────────────────

  const storageSum = await db.photo.aggregate({
    where: { event: { userId: user.id } },
    _sum:  { size: true },
  });
  await db.user.update({
    where: { id: user.id },
    data:  { storageUsedBytes: BigInt(storageSum._sum.size ?? 0) },
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  const finalPhotoCount = await db.photo.count({ where: { event: { userId: user.id } } });
  console.log(`
${"─".repeat(52)}
Records created / verified:
  1  photographer account  (docs@photohouse.test)
  1  docs admin account    (admin@photohouse.test)
  1  STUDIO subscription
  1  studio profile
  3  events
  ${totalGroups}  photo groups
  ${finalPhotoCount}  photos uploaded to S3
  ${totalSharedLinks}  shared links
  ${totalSelections}  photo selections  (${totalSelectedPhotos} selected photos)
  Storage synced: ${(Number(storageSum._sum.size ?? 0) / 1024).toFixed(1)} KB
${"─".repeat(52)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
