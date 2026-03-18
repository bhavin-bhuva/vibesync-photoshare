import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCloudfrontSignedUrl } from "@/lib/cloudfront";
import { getServerT } from "@/lib/i18n/server";
import { PersonalInfoForm } from "./PersonalInfoForm";
import { StudioBrandingForm, WatermarkSettings } from "./StudioBrandingForm";

export default async function ProfilePage() {
  const [t, session] = await Promise.all([getServerT(), getServerSession(authOptions)]);
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { studioProfile: true },
  });
  if (!user) redirect("/api/auth/force-signout");

  const sp = user.studioProfile;
  const logoUrl = sp?.logoS3Key ? await getCloudfrontSignedUrl(sp.logoS3Key) : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">

      {/* ── Header ── */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Link
            href="/dashboard"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label={t.nav.backToDashboard}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {t.profile.title}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">

        {/* ── Personal info ── */}
        <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t.profile.personalInfo.title}
          </h2>
          <PersonalInfoForm
            name={user.name ?? ""}
            email={user.email}
          />
        </section>

        {/* ── Studio branding ── */}
        <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t.profile.studio.title}
          </h2>
          <StudioBrandingForm
            profile={{
              studioName:        sp?.studioName        ?? "",
              tagline:           sp?.tagline           ?? null,
              website:           sp?.website           ?? null,
              phone:             sp?.phone             ?? null,
              address:           sp?.address           ?? null,
              brandColor:        sp?.brandColor        ?? null,
              logoUrl,
              watermarkEnabled:  sp?.watermarkEnabled  ?? true,
              watermarkPosition: sp?.watermarkPosition ?? "BOTTOM_RIGHT",
              watermarkOpacity:  sp?.watermarkOpacity  ?? 55,
            }}
          />
        </section>

        {/* ── Watermark settings ── */}
        <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {t.profile.watermark.title}
          </h2>
          <WatermarkSettings
            profile={{
              studioName:        sp?.studioName        ?? "",
              logoUrl,
              watermarkEnabled:  sp?.watermarkEnabled  ?? true,
              watermarkPosition: sp?.watermarkPosition ?? "BOTTOM_RIGHT",
              watermarkOpacity:  sp?.watermarkOpacity  ?? 55,
            }}
          />
        </section>

      </main>
    </div>
  );
}
