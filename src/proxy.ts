import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const authRoutes = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;

  // Root → redirect based on auth state
  if (pathname === "/") {
    const dest = !token ? "/login" : token.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Logged-in user hitting an auth page → send to their home
  if (token && authRoutes.includes(pathname)) {
    const dest = token.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Unauthenticated user hitting a protected page → send to login
  if (!token && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in but not SUPER_ADMIN hitting an admin route → send to dashboard
  if (token && pathname.startsWith("/admin") && token.role !== "SUPER_ADMIN") {
    const dashboardUrl = new URL("/dashboard", request.url);
    dashboardUrl.searchParams.set("error", "access_denied");
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
