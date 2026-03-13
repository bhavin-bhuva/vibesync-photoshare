import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exitImpersonation } from "@/lib/impersonation";

export async function ImpersonationBanner() {
  const jar = await cookies();
  const isImpersonating = jar.has("admin_session_backup");

  if (!isImpersonating) return null;

  const session = await getServerSession(authOptions);
  const name    = session?.user?.name ?? session?.user?.email ?? "this user";

  return (
    <div className="relative z-50 flex items-center justify-between gap-4 bg-red-700 px-6 py-2.5 text-sm text-white shadow-md">
      {/* Left — warning */}
      <div className="flex items-center gap-2.5">
        <svg
          className="h-4 w-4 shrink-0 text-red-200"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
        <span>
          You are viewing as{" "}
          <strong className="font-semibold">{name}</strong>
          {" "}— actions you take here affect a real account.
        </span>
      </div>

      {/* Right — exit button (form action so it works in server component) */}
      <form action={exitImpersonation}>
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-red-400 bg-red-800/60 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-900"
        >
          Exit impersonation →
        </button>
      </form>
    </div>
  );
}
