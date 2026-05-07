import { redirect } from "next/navigation";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { isMaintenanceMode } from "@/lib/platform-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MobileNav } from "@/components/MobileNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [maintenance, session] = await Promise.all([
    isMaintenanceMode(),
    getServerSession(authOptions),
  ]);

  if (maintenance && session?.user?.role !== "SUPER_ADMIN") {
    redirect("/maintenance");
  }

  return (
    <>
      <ImpersonationBanner />
      {session && (
        <MobileNav name={session.user.name ?? null} email={session.user.email} />
      )}
      {/* Bottom padding on mobile to clear the fixed tab bar (56px + safe area) */}
      <div className="pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
    </>
  );
}
