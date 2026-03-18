import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Clears all NextAuth session cookies and redirects to /login.
 * Used when a JWT token references a user that no longer exists in the database.
 */
export async function GET() {
  const cookieStore = await cookies();

  const sessionCookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "__Host-next-auth.csrf-token",
    "next-auth.csrf-token",
    "next-auth.callback-url",
  ];

  const response = NextResponse.redirect(
    new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
  );

  for (const name of sessionCookieNames) {
    if (cookieStore.has(name)) {
      response.cookies.delete(name);
    }
  }

  return response;
}
