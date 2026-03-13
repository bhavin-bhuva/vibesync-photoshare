"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { encode, decode } from "next-auth/jwt";
import { db } from "./db";
import { requireSuperAdmin } from "./admin";

// ─── Cookie names ─────────────────────────────────────────────────────────────

const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const IS_SECURE    = NEXTAUTH_URL.startsWith("https://");

// NextAuth v4 uses this cookie name convention
const SESSION_COOKIE  = IS_SECURE ? "__Secure-next-auth.session-token" : "next-auth.session-token";
const BACKUP_COOKIE   = "admin_session_backup";
const TARGET_COOKIE   = "admin_impersonation_target"; // stores the target userId for the exit redirect

const COOKIE_BASE = {
  httpOnly: true,
  secure:   IS_SECURE,
  sameSite: "lax" as const,
  path:     "/",
};

async function getIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

// ─── Impersonate ──────────────────────────────────────────────────────────────

export async function impersonateUser(targetUserId: string) {
  const session = await requireSuperAdmin();
  const ip      = await getIp();

  const jar = await cookies();

  const adminTokenValue = jar.get(SESSION_COOKIE)?.value;
  if (!adminTokenValue) throw new Error("Admin session token not found.");

  const targetUser = await db.user.findUniqueOrThrow({
    where:  { id: targetUserId, role: "PHOTOGRAPHER" },
    select: { id: true, email: true, name: true, role: true },
  });

  // Encode a new JWT for the impersonated photographer.
  // The jwt() callback in authOptions adds `id` and `role` on sign-in;
  // we replicate those fields here so the session callback works identically.
  const impersonatedToken = await encode({
    token: {
      sub:   targetUser.id,
      id:    targetUser.id,
      email: targetUser.email,
      name:  targetUser.name ?? undefined,
      role:  targetUser.role,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: 4 * 60 * 60, // 4-hour impersonation window
  });

  // Back up the real admin token and store the target userId
  jar.set(BACKUP_COOKIE, adminTokenValue, { ...COOKIE_BASE, maxAge: 4 * 60 * 60 });
  jar.set(TARGET_COOKIE, targetUserId,     { ...COOKIE_BASE, maxAge: 4 * 60 * 60 });

  // Swap in the impersonated session
  jar.set(SESSION_COOKIE, impersonatedToken, { ...COOKIE_BASE, maxAge: 4 * 60 * 60 });

  await db.adminActivityLog.create({
    data: {
      adminId:    session.user.id,
      action:     "IMPERSONATED_USER",
      targetType: "USER",
      targetId:   targetUserId,
      ipAddress:  ip,
    },
  });

  redirect("/dashboard");
}

// ─── Exit impersonation ───────────────────────────────────────────────────────

export async function exitImpersonation() {
  const ip  = await getIp();
  const jar = await cookies();

  const adminBackupValue = jar.get(BACKUP_COOKIE)?.value;
  const targetUserId     = jar.get(TARGET_COOKIE)?.value ?? null;

  if (!adminBackupValue) {
    // Nothing to restore — just go back to admin
    redirect("/admin/photographers");
  }

  // Decode the backup token to get the admin's ID for logging
  const adminToken = await decode({
    token:  adminBackupValue,
    secret: process.env.NEXTAUTH_SECRET!,
  });

  const adminId = adminToken?.id as string | undefined;

  if (adminId) {
    await db.adminActivityLog.create({
      data: {
        adminId,
        action:     "EXITED_IMPERSONATION",
        targetType: "USER",
        targetId:   targetUserId ?? "unknown",
        ipAddress:  ip,
      },
    });
  }

  // Restore the real admin session
  jar.set(SESSION_COOKIE, adminBackupValue, { ...COOKIE_BASE, maxAge: 30 * 24 * 60 * 60 });

  // Clean up impersonation cookies
  jar.delete(BACKUP_COOKIE);
  jar.delete(TARGET_COOKIE);

  redirect(targetUserId ? `/admin/photographers/${targetUserId}` : "/admin/photographers");
}
