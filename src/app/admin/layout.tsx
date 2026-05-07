import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin";
import { AdminShell } from "./AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    redirect("/login");
  }

  const { name, email } = session.user;

  return (
    <AdminShell name={name ?? null} email={email}>
      {children}
    </AdminShell>
  );
}
