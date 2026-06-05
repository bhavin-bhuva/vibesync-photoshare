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
import { ShareWelcomeGate } from "./ShareWelcomeGate";
import { IconLock, IconCalendar, ICON_COLOR } from "@/components/ui/icons";
import { GalleryRoot } from "@/components/gallery/GalleryRoot";
import { ThemeSwitcher } from "@/components/gallery/ThemeSwitcher";
import { type ThemeKey, type CustomThemeInput } from "@/lib/gallery-theme";

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
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--g-bg, #09090b)' }}>
      <div className="max-w-sm text-center">
        <div className="flex justify-center"><IconCalendar size={32} className={ICON_COLOR.muted} aria-hidden="true" /></div>
        <h1 className="mt-4 text-lg font-semibold" style={{ color: 'var(--g-text, #f4f4f5)' }}>
          {t.sharePage.expiredTitle}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--g-text-muted, #a1a1aa)' }}>
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

  const [link, linkPerLinkRows] = await Promise.all([
    db.sharedLink.findUnique({
      where: { slug },
      include: {
        event: {
          include: {
            photos: { orderBy: { createdAt: "desc" } },
            photoGroups: {
              where: { photoCount: { gt: 0 } },
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, color: true, photoCount: true, isVisible: true },
            },
            user: {
              include: { subscription: true, studioProfile: true },
            },
          },
        },
      },
    }),
    // Only per-link fields — gallery customisation now lives on Event
    db.$queryRaw<{
      defaultGridDensity: string;
      faceSearchEnabled: boolean;
      groupVisibilityOverrides: unknown;
    }[]>`
      SELECT "defaultGridDensity", "faceSearchEnabled", "groupVisibilityOverrides"
      FROM "SharedLink" WHERE slug = ${slug}
    `,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkAny = link as any;
  const perLink = linkPerLinkRows[0] ?? {
    defaultGridDensity: "default",
    faceSearchEnabled: false,
    groupVisibilityOverrides: null,
  };

  // Gallery customisation comes from the event (event-level, applies to all links)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventAny = link?.event as any;
  const linkExtra = {
    defaultGridDensity: perLink.defaultGridDensity,
    faceSearchEnabled: perLink.faceSearchEnabled,
    groupVisibilityOverrides: perLink.groupVisibilityOverrides,
    theme: eventAny?.theme ?? null,
    customThemeData: (eventAny?.customThemeData ?? null) as CustomThemeInput | null,
    welcomeEnabled: eventAny?.welcomeEnabled ?? false,
    welcomeMessage: eventAny?.welcomeMessage ?? null,
    welcomeHeroPhotoId: eventAny?.welcomeHeroPhotoId ?? null,
    introAnimation: eventAny?.introAnimation ?? "fade",
    showPhotoCount: eventAny?.showPhotoCount ?? true,
    showEventDate: eventAny?.showEventDate ?? true,
    galleryTitle: eventAny?.galleryTitle ?? null,
  };

  if (!link) notFound();

  // Suspended photographer — show generic unavailable page, no details
  if (link.event.user.isSuspended) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--g-bg, #09090b)' }}>
        <div className="max-w-sm text-center">
          <div className="flex justify-center"><IconLock size={32} className={ICON_COLOR.primary} aria-hidden="true" /></div>
          <h1 className="mt-4 text-lg font-semibold" style={{ color: 'var(--g-text, #f4f4f5)' }}>
            This gallery is no longer available
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--g-text-muted, #a1a1aa)' }}>
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

  // Theme — resolved before any early returns so all screens are themed
  const brandColor = sp?.brandColor ?? null;
  const themeKey = (linkExtra.theme ?? 'dark') as ThemeKey;
  const customInput = linkExtra.customThemeData;
  // Welcome screen hero photo — fetch before auth check so pre-auth screen is themed
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

  const welcomeGateProps = {
    slug,
    studioName: sp?.studioName ?? "PhotoHouse",
    studioLogoUrl: logoUrl ?? undefined,
    welcomeMessage: linkExtra.welcomeMessage ?? undefined,
    heroPhotoUrl: heroPhotoUrl ?? undefined,
    brandColor: brandColor ?? "#4f46e5",
    theme: linkExtra.theme ?? "minimal",
    introAnimation: linkExtra.introAnimation ?? "fade",
    filmstripPhotos: [] as string[],
  };

  if (!hasAccess) {
    // NONE: redirect to the grant route handler which sets the cookie
    // and redirects back here, so the user sees the gallery directly.
    if (accessType === "NONE") {
      redirect(`/api/share-grant/${slug}`);
    }

    // PIN: dedicated OTP entry screen
    if (accessType === "PIN") {
      return (
        <GalleryRoot
          slug={slug}
          photographerTheme={themeKey}
          customThemeInput={customInput}
          brandColor={brandColor}
          allowCustomerTheme={false}
        >
          {linkExtra.welcomeEnabled && <ShareWelcomeGate {...welcomeGateProps} />}
          <PinForm
            slug={slug}
            eventName={link.event.name}
            studioName={sp?.studioName ?? null}
            logoUrl={logoUrl}
          />
        </GalleryRoot>
      );
    }

    // PASSWORD: classic password form
    return (
      <GalleryRoot
        slug={slug}
        photographerTheme={themeKey}
        customThemeInput={customInput}
        brandColor={brandColor}
        allowCustomerTheme={false}
      >
        {linkExtra.welcomeEnabled && <ShareWelcomeGate {...welcomeGateProps} />}
        <PasswordForm
          slug={slug}
          eventName={link.event.name}
        />
      </GalleryRoot>
    );
  }

  // ── Authenticated gallery view ─────────────────────────────────────────────

  const { event } = link;

  // Resolve effective group visibility: per-link overrides take precedence over PhotoGroup.isVisible
  const groupOverrides = (linkExtra.groupVisibilityOverrides ?? null) as Record<string, boolean> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibleGroups = ((event as any).photoGroups as Array<{ id: string; name: string; color: string | null; photoCount: number; isVisible: boolean }>)
    .filter((g) => {
      if (groupOverrides !== null && g.id in groupOverrides) return groupOverrides[g.id];
      return g.isVisible;
    });

  const photographerPlan = event.user.subscription?.planTier ?? "FREE";
  const zipAllowed = photographerPlan !== "FREE";
  const totalSize = event.photos.reduce((s, p) => s + p.size, 0);

  // Face search is available when:
  //   1. The shared link has faceSearchEnabled = true
  //   2. The event has faceIndexingEnabled = true
  //   3. At least one FaceCluster exists (i.e. indexing has completed)
  const linkFaceSearchEnabled: boolean = linkExtra.faceSearchEnabled ?? false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventFaceIndexingEnabled: boolean = (event as any).faceIndexingEnabled ?? false;
  let faceSearchEnabled = false;
  if (linkFaceSearchEnabled && eventFaceIndexingEnabled) {
    const clusterCount = await db.faceCluster.count({ where: { eventId: event.id } });
    faceSearchEnabled = clusterCount > 0;
  }

  const [photos, coverUrl] = await Promise.all([
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
          : await getCloudfrontPreviewUrl(photo.s3Key, 800), // fallback for pre-existing photos
        signedUrl: await getCloudfrontPreviewUrl(photo.s3Key, 1920),
      }))
    ),
    event.coverPhotoKey ? getCloudfrontSignedUrl(event.coverPhotoKey) : null,
  ]);
  // Background precedence: cover photo > brand color > dark gradient fallback
  const heroBg = coverUrl
    ? undefined
    : brandColor
    ? { backgroundColor: brandColor }
    : undefined;

  // Build filmstripPhotos now that photos are signed and available
  const filmstripPhotos = photos
    .slice(0, 5)
    .map((p) => p.thumbnailUrl)
    .filter((u): u is string => u !== null);

  return (
    <GalleryRoot
      slug={slug}
      photographerTheme={themeKey}
      customThemeInput={customInput}
      brandColor={brandColor}
      allowCustomerTheme={true}
    >
      {/* Welcome screen overlay — sessionStorage tracks dismissal per slug */}
      {linkExtra.welcomeEnabled && (
        <ShareWelcomeGate {...welcomeGateProps} filmstripPhotos={filmstripPhotos} />
      )}

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
        <div className="relative z-10 w-full px-4 pb-7 pt-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="inline-flex w-full flex-col items-center gap-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:flex-row sm:items-center sm:gap-5 sm:px-6">

              {/* Brand mark: logo > initials > generic camera */}
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={sp!.studioName}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover ring-2 ring-white/30 shadow-lg sm:self-auto"
                />
              ) : sp ? (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg font-bold text-white shadow-lg ring-2 ring-white/20 sm:self-auto">
                  {sp.studioName.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-lg ring-2 ring-white/20 sm:self-auto">
                  <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                    <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
                  </svg>
                </div>
              )}

              {/* Text info */}
              <div className="min-w-0 flex-1 text-center sm:text-left">
                {sp && (
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {sp.studioName}
                  </p>
                )}
                <h1 className="truncate text-xl font-bold text-white drop-shadow-sm">
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

      {/* Gallery */}
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
        <Gallery
          photos={photos}
          slug={slug}
          sharedLinkId={link.id}
          zipAllowed={zipAllowed}
          faceSearchEnabled={faceSearchEnabled}
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

      <ThemeSwitcher />
    </GalleryRoot>
  );
}
