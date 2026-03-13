import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    redirect("/login");
  }

  const { name, email } = session.user;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100">
      <Sidebar name={name ?? null} email={email} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
