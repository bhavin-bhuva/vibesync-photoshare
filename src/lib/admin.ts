import { getServerSession } from "next-auth";
import { authOptions, isSuperAdmin } from "./auth";

/**
 * Call at the top of any admin server action or API route handler.
 * Throws a 403 error if the caller is not a SUPER_ADMIN.
 *
 * Usage:
 *   const session = await requireSuperAdmin();
 *   // session.user is now guaranteed to be a SUPER_ADMIN
 */
export async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  if (!isSuperAdmin(session)) {
    throw new Error("FORBIDDEN");
  }

  return session;
}
