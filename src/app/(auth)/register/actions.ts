"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { isSignupsEnabled } from "@/lib/platform-settings";

type FormState = { error: string } | null;

export async function registerAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!(await isSignupsEnabled())) {
    return { error: "New registrations are currently disabled." };
  }

  if (!name || !email || !password) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      subscription: {
        create: {
          stripeCustomerId: `cus_pending_${Date.now()}`,
          planTier: "FREE",
          status: "active",
        },
      },
    },
  });

  redirect("/login?registered=true");
}
