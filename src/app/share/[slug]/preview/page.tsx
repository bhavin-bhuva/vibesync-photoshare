import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCloudfrontSignedUrl, getCloudfrontPreviewUrl } from "@/lib/cloudfront";
import { Gallery } from "../Gallery";
import { PreviewWelcome } from "../PreviewWelcome";
import { GalleryRoot } from "@/components/gallery/GalleryRoot";
import { type ThemeKey, type CustomThemeInput } from "@/lib/gallery-theme";
import { getServerT } from "@/lib/i18n/server";

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

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  const t = await getServerT();

  // ── Auth: token OR photographer session ────────────────────────────────────

  let authorisedLinkId: string | null = null;

  if (token) {
    const previewToken = await db.previewToken.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
        sharedLink: { slug },
      },
      select: { sharedLinkId: true },
    });
    if (previewToken) authorisedLinkId = previewToken.sharedLinkId;
  }

  if (!authorisedLinkId) {
    const session = await getServerSession(authOptions);
    if (session) {
      const link = await db.sharedLink.findFirst({
        where: { slug, event: { userId: session.user.id } },
        select: { id: true },
      });
      if (link) authorisedLinkId = link.id;
    }
  }

  if (!authorisedLinkId) {
    redirect("/dashboard");
  }

  // ── Data fetch (mirrors share/[slug]/page.tsx) ─────────────────────────────

  const [link, linkExtraRows] = await Promise.all([
    db.sharedLink.findUnique({
      where: { slug },
      include: {
        event: {
          include: {
            photos: { orderBy: { createdAt: "desc" } },
            photoGroups: {
              where: { photoCount: { gt: 0 } },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                name: true,
                color: true,
                photoCount: true,
                isVisible: true,
              },
            },
            user: { include: { subscription: true, studioProfile: true } },
          },
        },
      },
    }),
    db.$queryRaw<{
      defaultGridDensity: string;
      faceSearchEnabled: boolean;
      groupVisibilityOverrides: unknown;
      theme: string | null;
      welcomeEnabled: boolean;
      welcomeMessage: string | null;
      welcomeHeroPhotoId: string | null;
      introAnimation: string;
    }[]>`
      SELECT
        "defaultGridDensity",
        "faceSearchEnabled",
        "groupVisibilityOverrides",
        "theme",
        "welcomeEnabled",
        "welcomeMessage",
        "welcomeHeroPhotoId",
        "introAnimation"
      FROM "SharedLink"
      WHERE slug = ${slug}
    `,
  ]);

  if (!link) redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkExtra = linkExtraRows[0] ?? {
    defaultGridDensity: "default",
    faceSearchEnabled: false,
    groupVisibilityOverrides: null,
    theme: null,
    welcomeEnabled: false,
    welcomeMessage: null,
    welcomeHeroPhotoId: null,
    introAnimation: "fade",
  };

  const { event } = link;
  const sp = event.user.studioProfile;
  const brandColor = sp?.brandColor ?? "#4f46e5";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventAny = event as any;
  const themeKey = (eventAny?.theme ?? linkExtra.theme ?? 'dark') as ThemeKey;
  const customInput = (eventAny?.customThemeData ?? null) as CustomThemeInput | null;
  const photographerPlan = event.user.subscription?.planTier ?? "FREE";
  const zipAllowed = photographerPlan !== "FREE";
  const totalSize = event.photos.reduce((s, p) => s + p.size, 0);

  // Resolve group visibility
  const groupOverrides = (linkExtra.groupVisibilityOverrides ?? null) as Record<string, boolean> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibleGroups = ((event as any).photoGroups as Array<{
    id: string;
    name: string;
    color: string | null;
    photoCount: number;
    isVisible: boolean;
  }>).filter((g) => {
    if (groupOverrides !== null && g.id in groupOverrides) return groupOverrides[g.id];
    return g.isVisible;
  });

  // Fetch signed URLs
  const [photos, coverUrl, logoUrl] = await Promise.all([
    Promise.all(
      event.photos.map(async (photo) => ({
        id: photo.id,
        filename: photo.filename,
        size: photo.size,
        createdAt: photo.createdAt,
        width: photo.width ?? null,
        height: photo.height ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupId: (photo as any).groupId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifCameraMake:   (photo as any).exifCameraMake   ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifCameraModel:  (photo as any).exifCameraModel  ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifFocalLength:  (photo as any).exifFocalLength  ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifAperture:     (photo as any).exifAperture     ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifShutterSpeed: (photo as any).exifShutterSpeed ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifIso:          (photo as any).exifIso          ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exifShootDate:    (photo as any).exifShootDate    ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbnailUrl: (photo as any).thumbS3Key
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? await getCloudfrontSignedUrl((photo as any).thumbS3Key)
          : await getCloudfrontPreviewUrl(photo.s3Key, 800),
        signedUrl: await getCloudfrontPreviewUrl(photo.s3Key, 1920),
      }))
    ),
    event.coverPhotoKey ? getCloudfrontSignedUrl(event.coverPhotoKey) : null,
    sp?.logoS3Key ? getCloudfrontSignedUrl(sp.logoS3Key) : null,
  ]);

  // Welcome screen hero photo
  let heroPhotoUrl: string | null = null;
  if (linkExtra.welcomeEnabled && linkExtra.welcomeHeroPhotoId) {
    const heroPhoto = await db.photo.findUnique({
      where: { id: linkExtra.welcomeHeroPhotoId },
      select: { s3Key: true, thumbS3Key: true },
    });
    if (heroPhoto) {
      heroPhotoUrl = heroPhoto.thumbS3Key
        ? (getCloudfrontSignedUrl(heroPhoto.thumbS3Key) ?? await getCloudfrontPreviewUrl(heroPhoto.s3Key, 1920))
        : await getCloudfrontPreviewUrl(heroPhoto.s3Key, 1920);
    }
  }

  // First 5 thumbnail URLs for filmstrip
  const filmstripPhotos = photos
    .slice(0, 5)
    .map((p) => p.thumbnailUrl)
    .filter((u): u is string => u !== null);

  // Hero background
  const heroBg = coverUrl
    ? undefined
    : brandColor
    ? { backgroundColor: brandColor }
    : undefined;

  return (
    <GalleryRoot
      slug={slug}
      photographerTheme={themeKey}
      customThemeInput={customInput}
      brandColor={sp?.brandColor ?? null}
      allowCustomerTheme={false}
    >
    <div style={{ paddingTop: 8 }}>
      {/* ── Preview strip (fixed, above everything) ── */}
      <div
        aria-hidden="true"
        className="fixed top-0 inset-x-0 z-[60]"
        style={{ height: 8, background: brandColor }}
      />

      {/* ── Welcome screen (fixed overlay, dismisses on continue) ── */}
      {linkExtra.welcomeEnabled && (
        <PreviewWelcome
          studioName={sp?.studioName ?? "PhotoHouse"}
          studioLogoUrl={logoUrl ?? undefined}
          welcomeMessage={linkExtra.welcomeMessage ?? undefined}
          heroPhotoUrl={heroPhotoUrl ?? undefined}
          brandColor={brandColor}
          theme={linkExtra.theme ?? "minimal"}
          introAnimation={linkExtra.introAnimation}
          filmstripPhotos={filmstripPhotos}
        />
      )}

      {/* ── Hero header ── */}
      <header
        className="relative flex min-h-[320px] items-end overflow-hidden"
        style={heroBg}
      >
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />

        <div className="relative z-10 w-full px-4 pb-7 pt-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="inline-flex w-full flex-col items-center gap-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:flex-row sm:items-center sm:gap-5 sm:px-6">
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

              <div className="min-w-0 flex-1 text-center sm:text-left">
                {sp && (
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {sp.studioName}
                  </p>
                )}
                <h1
                  className="truncate text-xl font-bold text-white drop-shadow-sm"
                  style={{ fontFamily: "var(--theme-font-heading)" }}
                >
                  {event.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 sm:justify-start">
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

      {/* ── Gallery ── */}
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
        <Gallery
          photos={photos}
          slug={slug}
          sharedLinkId={link.id}
          zipAllowed={zipAllowed}
          faceSearchEnabled={false}
          groups={visibleGroups}
          eventName={event.name}
          brandColor={brandColor}
          serverDefaultDensity={(linkExtra.defaultGridDensity ?? "default") as string}
        />
      </main>

      <footer
        className="py-6 text-center"
        style={{ borderTop: "1px solid var(--theme-border)", color: "var(--theme-text-muted)" }}
      >
        <p className="text-xs">{t.app.tagline}</p>
      </footer>

      {/* ── Floating preview badge ── */}
      <div
        className="fixed bottom-4 right-4 z-[60] max-w-[240px] rounded-full px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.65)" }}
      >
        Preview Mode — Customers won&apos;t see this
      </div>
    </div>
    </GalleryRoot>
  );
}
