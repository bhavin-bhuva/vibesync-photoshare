import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyShareToken } from "@/lib/share-token";
import { getCloudfrontSignedUrl } from "@/lib/cloudfront";
import { PasswordForm } from "./PasswordForm";
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

/**
 * Returns "white" or "black" — whichever contrasts better against the given
 * hex background color, using the W3C perceived-luminance formula.
 */
function contrastColor(hex: string): "white" | "black" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "black" : "white";
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
          user: { include: { subscription: true, studioProfile: true } },
        },
      },
    },
  });

  if (!link) notFound();

  if (link.expiresAt && new Date() > link.expiresAt) {
    return <ExpiredPage eventName={link.event.name} t={t} />;
  }

  // Check the signed access cookie set after password verification
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  const hasAccess = token ? verifyShareToken(slug, token) : false;

  if (!hasAccess) {
    return <PasswordForm slug={slug} eventName={link.event.name} />;
  }

  // ── Authenticated gallery view ────────────────────────────────────────────

  const { event } = link;
  const photographerPlan = event.user.subscription?.planTier ?? "FREE";
  const zipAllowed = photographerPlan !== "FREE";
  const totalSize = event.photos.reduce((s, p) => s + p.size, 0);

  const photos = event.photos.map((photo) => ({
    id: photo.id,
    filename: photo.filename,
    size: photo.size,
    signedUrl: getCloudfrontSignedUrl(photo.s3Key),
  }));

  // ── Studio branding ──────────────────────────────────────────────────────
  const sp = event.user.studioProfile;
  const logoUrl      = sp?.logoS3Key      ? getCloudfrontSignedUrl(sp.logoS3Key)      : null;
  const coverUrl     = event.coverPhotoKey ? getCloudfrontSignedUrl(event.coverPhotoKey) : null;
  const brandColor   = sp?.brandColor ?? null;

  // Background precedence: cover photo > brand color > dark gradient fallback
  const heroBg = coverUrl
    ? undefined                           // image handled via <img>
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
          /* Neutral dark gradient when neither cover nor brand color is set */
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
        )}

        {/* Scrim — ensures glass card is readable over any background */}
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
        <Gallery photos={photos} slug={slug} zipAllowed={zipAllowed} />
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center dark:border-zinc-700">
        <p className="text-xs text-zinc-400">{t.app.tagline}</p>
      </footer>
    </div>
  );
}
