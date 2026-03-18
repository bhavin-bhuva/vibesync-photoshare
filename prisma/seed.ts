import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const photographerHash = await bcrypt.hash("test123", 12);

  const user = await db.user.upsert({
    where: { email: "test@photo.com" },
    update: {},
    create: {
      email: "test@photo.com",
      passwordHash: photographerHash,
      name: "Test Photographer",
      subscription: {
        create: {
          stripeCustomerId: "cus_test_placeholder",
          planTier: "FREE",
          status: "active",
        },
      },
    },
    include: { subscription: true },
  });

  console.log(`Seeded user: ${user.email} (id: ${user.id})`);
  console.log(`Plan: ${user.subscription?.planTier}`);

  const adminHash = await bcrypt.hash("Admin@123456", 12);

  const admin = await db.user.upsert({
    where: { email: "admin@photoshare.com" },
    update: {},
    create: {
      email: "admin@photoshare.com",
      passwordHash: adminHash,
      name: "Super Admin",
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Seeded admin: ${admin.email} (id: ${admin.id})`);
  console.log("No default plans seeded — create plans from /admin/plans");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
