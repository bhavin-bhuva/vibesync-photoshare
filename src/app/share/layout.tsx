import { redirect } from "next/navigation";
import { isMaintenanceMode } from "@/lib/platform-settings";

export default async function ShareLayout({ children }: { children: React.ReactNode }) {
  if (await isMaintenanceMode()) {
    redirect("/maintenance");
  }
  return <>{children}</>;
}
