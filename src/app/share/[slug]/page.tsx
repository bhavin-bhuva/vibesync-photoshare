import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyShareToken } from "@/lib/share-token";
import { getCloudfrontSignedUrl, getCloudfrontPreviewUrl } from "@/lib/cloudfront";
import { PasswordForm } from "./PasswordForm";
import { PinForm } from "./PinForm";
import { Gallery } from "./Gallery";
import { getServerT } from "@/lib/i18n/server";
import type { Translations } from "@/lib/i18n";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ─── Expired state ────────────────────────────────────────────────────────────

function ExpiredPage({ eventName, t }: { eventName: string; t: Translations }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-900">
      <div className="max-w-sm text-center">
        <p className="text-4xl">⏳</p>
        <h1 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t.sharePage.expiredTitle}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {t.sharePage.expiredMessage(eventName)}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getServerT();

  const link = await db.sharedLink.findUnique({
    where: { slug },
    include: {
      event: {
        include: {
          photos: { orderBy: { createdAt: "desc" } },
          user: {
            include: { subscription: true, studioProfile: true },
          },
        },
      },
    },
  });

  if (!link) notFound();

  // Suspended photographer — show generic unavailable page, no details
  if (link.event.user.isSuspended) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-900">
        <div className="max-w-sm text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            This gallery is no longer available
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            This gallery is no longer accessible. Please contact the photographer directly.
          </p>
        </div>
      </div>
    );
  }

  if (link.expiresAt && new Date() > link.expiresAt) {
    return <ExpiredPage eventName={link.event.name} t={t} />;
  }

  // ── Access check ───────────────────────────────────────────────────────────

  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  const hasAccess = token ? verifyShareToken(slug, token) : false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessType = ((link as any).accessType as string ?? "PASSWORD") as "PASSWORD" | "PIN" | "NONE";

  // Studio profile — needed for both the PIN gate and the gallery hero
  const sp = link.event.user.studioProfile;

  // Logo URL — computed early so PinForm can show studio branding before auth
  const logoUrl = sp?.logoS3Key ? await getCloudfrontSignedUrl(sp.logoS3Key) : null;

  if (!hasAccess) {
    // NONE: redirect to the grant route handler which sets the cookie
    // and redirects back here, so the user sees the gallery directly.
    if (accessType === "NONE") {
      redirect(`/api/share-grant/${slug}`);
    }

    // PIN: dedicated OTP entry screen
    if (accessType === "PIN") {
      return (
        <PinForm
          slug={slug}
          eventName={link.event.name}
          studioName={sp?.studioName ?? null}
          logoUrl={logoUrl}
        />
      );
    }

    // PASSWORD: classic password form
    return <PasswordForm slug={slug} eventName={link.event.name} />;
  }

  // ── Authenticated gallery view ─────────────────────────────────────────────

  const { event } = link;
  const photographerPlan = event.user.subscription?.planTier ?? "FREE";
  const zipAllowed = photographerPlan !== "FREE";
  const totalSize = event.photos.reduce((s, p) => s + p.size, 0);

  const [photos, coverUrl] = await Promise.all([
    Promise.all(
      event.photos.map(async (photo) => ({
        id: photo.id,
        filename: photo.filename,
        size: photo.size,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbnailUrl: (photo as any).thumbS3Key
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? await getCloudfrontSignedUrl((photo as any).thumbS3Key)
          : await getCloudfrontPreviewUrl(photo.s3Key, 800), // fallback for pre-existing photos
        signedUrl: await getCloudfrontPreviewUrl(photo.s3Key, 1920),
      }))
    ),
    event.coverPhotoKey ? getCloudfrontSignedUrl(event.coverPhotoKey) : null,
  ]);
  // logoUrl already computed above — reused here

  const brandColor = sp?.brandColor ?? null;

  // Background precedence: cover photo > brand color > dark gradient fallback
  const heroBg = coverUrl
    ? undefined
    : brandColor
    ? { backgroundColor: brandColor }
    : undefined;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* ── Hero header ── */}
      <header
        className="relative flex min-h-[320px] items-end overflow-hidden"
        style={heroBg}
      >
        {/* Background layer */}
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : !brandColor && (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
        )}

        {/* Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />

        {/* ── Glassmorphism info card ── */}
        <div className="relative z-10 w-full px-6 pb-7 pt-20">
          <div className="mx-auto max-w-6xl">
            <div className="inline-flex w-full flex-col gap-4 rounded-2xl border border-white/20 bg-white/10 px-6 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:flex-row sm:items-center sm:gap-5">

              {/* Brand mark: logo > initials > generic camera */}
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={sp!.studioName}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover ring-2 ring-white/30 shadow-lg"
                />
              ) : sp ? (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg font-bold text-white shadow-lg ring-2 ring-white/20">
                  {sp.studioName.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-lg ring-2 ring-white/20">
                  <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                    <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
                  </svg>
                </div>
              )}

              {/* Text info */}
              <div className="min-w-0 flex-1">
                {sp && (
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {sp.studioName}
                  </p>
                )}
                <h1 className="truncate text-xl font-bold text-white drop-shadow-sm">
                  {event.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <span className="text-sm text-white/70">{formatDate(event.date)}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-sm text-white/70">{t.common.photoCount(event.photos.length)}</span>
                  {totalSize > 0 && (
                    <>
                      <span className="text-white/30">·</span>
                      <span className="text-sm text-white/70">{formatBytes(totalSize)}</span>
                    </>
                  )}
                </div>
                {event.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-white/60">{event.description}</p>
                )}
              </div>

            </div>
          </div>
        </div>
      </header>

      {/* Gallery */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Gallery photos={photos} slug={slug} sharedLinkId={link.id} zipAllowed={zipAllowed} />
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center dark:border-zinc-700">
        <p className="text-xs text-zinc-400">{t.app.tagline}</p>
      </footer>
    </div>
  );
}
