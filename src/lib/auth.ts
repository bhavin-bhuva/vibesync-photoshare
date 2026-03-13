import { type NextAuthOptions, type Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { getSetting, SETTING_KEYS } from "./platform-settings";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          select: {
            id:              true,
            email:           true,
            name:            true,
            role:            true,
            passwordHash:    true,
            isSuspended:     true,
            suspendedReason: true,
          },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // ── Suspension check ────────────────────────────────────────────────
        if (user.isSuspended) {
          const supportEmail = (await getSetting(SETTING_KEYS.SUPPORT_EMAIL)) || "support@photoshare.com";
          const reason       = user.suspendedReason?.trim() || "No reason provided";
          throw new Error(
            `Your account has been suspended. Reason: ${reason}. Contact support at ${supportEmail}`
          );
        }

        // ── Record login timestamp + IP (fire and forget) ───────────────────
        const rawHeaders = req?.headers;
        let ip: string | null = null;
        if (rawHeaders) {
          const fwd = rawHeaders instanceof Headers
            ? rawHeaders.get("x-forwarded-for")
            : (rawHeaders as Record<string, string>)["x-forwarded-for"];
          const real = rawHeaders instanceof Headers
            ? rawHeaders.get("x-real-ip")
            : (rawHeaders as Record<string, string>)["x-real-ip"];
          ip = (typeof fwd === "string" ? fwd.split(",")[0].trim() : null) ?? real ?? null;
        }

        db.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } })
          .catch((e) => console.error("[auth] Failed to update lastLoginAt:", e));

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: "PHOTOGRAPHER" | "SUPER_ADMIN" }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

export function isSuperAdmin(session: Session | null): boolean {
  return session?.user?.role === "SUPER_ADMIN";
}
