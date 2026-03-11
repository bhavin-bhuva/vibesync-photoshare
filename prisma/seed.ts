import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("test123", 12);

  const user = await db.user.upsert({
    where: { email: "test@photo.com" },
    update: {},
    create: {
      email: "test@photo.com",
      passwordHash,
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
