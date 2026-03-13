import { redirect } from "next/navigation";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { isMaintenanceMode } from "@/lib/platform-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Admins bypass maintenance mode
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
      {children}
    </>
  );
}
