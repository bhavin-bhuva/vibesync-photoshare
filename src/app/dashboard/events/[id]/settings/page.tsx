import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { getCloudfrontSignedUrl, getCloudfrontPreviewUrl } from "@/lib/cloudfront";
import { type NavItem } from "./SettingsSidebar";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { EventDetailsSection } from "@/components/settings/EventDetailsSection";
import { SharedLinksSection, type SharedLinkRow } from "@/components/settings/SharedLinksSection";
import { GalleryCustomisationSection } from "@/components/settings/GalleryCustomisationSection";
import { PhotoGroupsSection } from "@/components/settings/PhotoGroupsSection";
import { FaceDetectionSection } from "@/components/settings/FaceDetectionSection";
import { CullingSection } from "@/components/settings/CullingSection";
import { WatermarkSection } from "@/components/settings/WatermarkSection";
import { DangerZoneSection } from "@/components/settings/DangerZoneSection";

type SectionDef = {
  id: string;
  title: string;
  subtitle: string;
  destructive?: boolean;
};

const SECTIONS: SectionDef[] = [
  { id: "event-details",  title: "Event Details",         subtitle: "Edit event name, date, and description." },
  { id: "shared-links",   title: "Shared Links",           subtitle: "Manage links and access settings for client galleries." },
  { id: "gallery",        title: "Gallery Customisation",  subtitle: "Choose themes, welcome screens, and display options." },
  { id: "photo-groups",   title: "Photo Groups",           subtitle: "Organise photos into labelled groups for clients." },
  { id: "face-detection", title: "Face Detection",         subtitle: "Enable automatic face indexing for client face search." },
  { id: "ai-culling",     title: "AI Culling",             subtitle: "Review and apply AI photo selection suggestions." },
  { id: "watermark",      title: "Watermark",              subtitle: "Apply your studio watermark to client downloads." },
  { id: "danger-zone",    title: "Danger Zone",            subtitle: "Irreversible actions — proceed with caution.", destructive: true },
];

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [
    event,
    linksRaw,
    groups,
    studioProfile,
    subscription,
    pickerPhotosRaw,
    faceClusterCount,
    ungroupedCount,
    totalFacesAgg,
    photosAnalyzedCount,
    lastFaceJob,
    cullKeep,
    cullReject,
    cullReview,
    cullPending,
    totalPhotoCount,
    lastCullingJob,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.event.findUnique as any)({
      where: { id: eventId },
      select: {
        id: true, name: true, date: true, description: true,
        coverPhotoKey: true, faceIndexingEnabled: true, userId: true,
        cullingEnabled: true, autoCullOnUpload: true, cullingSensitivity: true,
        lastClusteredAt: true, lastCulledAt: true,
        watermarkOverride: true, watermarkEnabled: true, watermarkSource: true,
        watermarkPosition: true, watermarkOpacity: true,
        isArchived: true,
        theme: true, welcomeEnabled: true, welcomeMessage: true,
        welcomeHeroPhotoId: true, introAnimation: true,
        showPhotoCount: true, showEventDate: true,
        galleryTitle: true, gallerySubtitle: true,
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.sharedLink.findMany as any)({
      where: { eventId },
      orderBy: { createdAt: "desc" as const },
      select: {
        id: true, slug: true, expiresAt: true, createdAt: true,
        accessType: true, faceSearchEnabled: true,
        downloadsEnabled: true, zipDownloadEnabled: true, selectionEnabled: true,
      },
    }) as Promise<SharedLinkRow[]>,
    db.photoGroup.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" as const },
      select: { id: true, name: true, color: true, photoCount: true, isVisible: true, description: true, sortOrder: true },
    }),
    db.studioProfile.findUnique({
      where: { userId: session.user.id },
      select: { brandColor: true, watermarkEnabled: true, watermarkPosition: true, watermarkOpacity: true, studioName: true, logoS3Key: true },
    }),
    db.subscription.findFirst({
      where: { userId: session.user.id },
      select: { planTier: true },
    }),
    db.photo.findMany({
      where: { eventId, status: "READY" },
      orderBy: { createdAt: "desc" as const },
      take: 24,
      select: { id: true, s3Key: true, thumbS3Key: true },
    }),
    db.faceCluster.count({ where: { eventId } }),
    db.photo.count({ where: { eventId, groupId: null, status: "READY" } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.faceCluster.aggregate as any)({ where: { eventId }, _sum: { faceCount: true } }),
    db.faceRecord.groupBy({ by: ["photoId"], where: { eventId } }).then((r) => r.length),
    db.faceIndexingJob.findFirst({
      where: { eventId },
      orderBy: { createdAt: "desc" as const },
      select: { status: true, processedPhotos: true, totalPhotos: true, completedAt: true },
    }),
    db.photoCullScore.count({ where: { eventId, cullStatus: "KEEP" } }),
    db.photoCullScore.count({ where: { eventId, cullStatus: "REJECT" } }),
    db.photoCullScore.count({ where: { eventId, autoSuggestion: "REVIEW", photographerOverride: false } }),
    db.photoCullScore.count({ where: { eventId, cullStatus: "PENDING" } }),
    db.photo.count({ where: { eventId, status: "READY" } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.cullingJob.findFirst as any)({
      where: { eventId },
      orderBy: { createdAt: "desc" as const },
      select: { status: true, processedPhotos: true, totalPhotos: true, completedAt: true },
    }),
  ]);

  if (!event || event.userId !== session.user.id) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = event as any;
  const plan = (subscription?.planTier ?? "FREE") as "FREE" | "PRO" | "STUDIO";
  const brandColor = studioProfile?.brandColor ?? "#6366f1";

  const studioLogoUrl = studioProfile?.logoS3Key
    ? (getCloudfrontSignedUrl(studioProfile.logoS3Key) ?? null)
    : null;

  const activeLinksCount = linksRaw.filter(
    (l) => !l.expiresAt || new Date(l.expiresAt) > new Date(),
  ).length;

  const coverPhotoUrl = ev.coverPhotoKey ? getCloudfrontSignedUrl(ev.coverPhotoKey) : null;

  const pickerPhotos = pickerPhotosRaw.map((p) => ({
    id: p.id,
    thumbnailUrl:
      (p.thumbS3Key
        ? getCloudfrontSignedUrl(p.thumbS3Key)
        : getCloudfrontPreviewUrl(p.s3Key, 800)) ?? "",
  }));

  const truncatedName = ev.name.length > 20 ? `${ev.name.slice(0, 20)}…` : ev.name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalFaces = (totalFacesAgg as any)?._sum?.faceCount ?? 0;

  const lastFaceJobSerialized = lastFaceJob
    ? { ...lastFaceJob, status: String(lastFaceJob.status), completedAt: lastFaceJob.completedAt?.toISOString() ?? null }
    : null;

  const lastCullingJobSerialized = lastCullingJob
    ? { ...lastCullingJob, status: String(lastCullingJob.status), completedAt: lastCullingJob.completedAt?.toISOString() ?? null }
    : null;

  const navItems: NavItem[] = [
    { id: "event-details",  label: "Event Details",  icon: "event-details" },
    { id: "shared-links",   label: "Shared Links",   icon: "shared-links", badge: activeLinksCount > 0 ? String(activeLinksCount) : null },
    { id: "gallery",        label: "Customisation",  icon: "gallery" },
    { id: "photo-groups",   label: "Photo Groups",   icon: "photo-groups", badge: groups.length > 0 ? String(groups.length) : null },
    { id: "face-detection", label: "Face Detection", icon: "face-detection", badge: ev.faceIndexingEnabled ? "On" : "Off", badgeVariant: ev.faceIndexingEnabled ? "success" : "muted" },
    { id: "ai-culling",     label: "AI Culling",     icon: "ai-culling",
      badge: cullReview > 0 ? String(cullReview) : null,
      badgeVariant: cullReview > 0 ? "default" : undefined },
    { id: "watermark",      label: "Watermark",      icon: "watermark",
      badge: ev.watermarkOverride ? "Custom" : "Default",
      badgeVariant: ev.watermarkOverride ? "success" : "muted" },
  ];

  return (
    <SettingsShell
      navItems={navItems}
      eventName={truncatedName}
      backHref={`/dashboard/events/${eventId}`}
      brandColor={brandColor}
    >
      <div className="mx-auto max-w-[720px] py-6 md:px-12 md:py-0">
        {SECTIONS.map((section, i) => (
          <section key={section.id} id={section.id} className="scroll-mt-16 md:scroll-mt-8">
            {/* Section heading — hidden on mobile (redundant with sticky pill tabs) */}
            <div className="hidden items-center gap-3 md:flex">
              <h2
                className={`text-[22px] font-bold leading-tight ${
                  section.destructive
                    ? "text-red-600 dark:text-red-400"
                    : "text-zinc-900 dark:text-zinc-50"
                }`}
              >
                {section.title}
              </h2>
              {section.id === "watermark" && plan === "FREE" && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      PRO
                    </span>
                  )}
                </div>
            <p className="mt-1 hidden text-sm text-zinc-500 md:block dark:text-zinc-400">{section.subtitle}</p>

            <div className="mt-6 md:mt-6">
                  {section.id === "event-details" && (
                    <EventDetailsSection
                      event={{
                        id: ev.id,
                        name: ev.name,
                        date: ev.date.toISOString().slice(0, 10),
                        description: ev.description,
                        coverPhotoUrl,
                      }}
                      eventPhotos={pickerPhotos}
                    />
                  )}
                  {section.id === "shared-links" && (
                    <SharedLinksSection
                      eventId={eventId}
                      initialLinks={linksRaw}
                      groups={groups}
                      plan={plan}
                      faceIndexingEnabled={!!ev.faceIndexingEnabled}
                      faceIndexingDone={faceClusterCount > 0}
                      peopleIndexed={faceClusterCount}
                      eventTitle={ev.name}
                      studioName={studioProfile?.studioName ?? "PhotoHouse"}
                      brandColor={brandColor}
                      eventPhotos={pickerPhotos}
                    />
                  )}
                  {section.id === "gallery" && (
                    <GalleryCustomisationSection
                      event={{
                        id: ev.id,
                        theme: ev.theme ?? "minimal",
                        welcomeEnabled: ev.welcomeEnabled ?? false,
                        welcomeMessage: ev.welcomeMessage ?? null,
                        welcomeHeroPhotoId: ev.welcomeHeroPhotoId ?? null,
                        introAnimation: ev.introAnimation ?? "fade",
                        showPhotoCount: ev.showPhotoCount ?? true,
                        showEventDate: ev.showEventDate ?? true,
                        galleryTitle: ev.galleryTitle ?? null,
                        gallerySubtitle: ev.gallerySubtitle ?? null,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        customThemeData: (ev as any).customThemeData ?? null,
                      }}
                      plan={plan}
                      brandColor={brandColor}
                      eventPhotos={pickerPhotos}
                      eventTitle={ev.name}
                      studioName={studioProfile?.studioName ?? "PhotoHouse"}
                      firstLinkId={linksRaw[0]?.id ?? null}
                    />
                  )}
                  {section.id === "photo-groups" && (
                    <PhotoGroupsSection
                      eventId={eventId}
                      initialGroups={groups}
                      ungroupedCount={ungroupedCount}
                    />
                  )}
                  {section.id === "face-detection" && (
                    <FaceDetectionSection
                      eventId={eventId}
                      faceIndexingEnabled={!!ev.faceIndexingEnabled}
                      clusterCount={faceClusterCount}
                      totalFaces={totalFaces}
                      photosAnalyzed={photosAnalyzedCount}
                      lastClusteredAt={ev.lastClusteredAt?.toISOString?.() ?? null}
                      lastJob={lastFaceJobSerialized}
                    />
                  )}
                  {section.id === "ai-culling" && (
                    <CullingSection
                      eventId={eventId}
                      cullingEnabled={!!ev.cullingEnabled}
                      autoCullOnUpload={!!ev.autoCullOnUpload}
                      cullingSensitivity={ev.cullingSensitivity ?? "medium"}
                      stats={{ keep: cullKeep, review: cullReview, reject: cullReject, pending: cullPending }}
                      lastJob={lastCullingJobSerialized}
                      lastCulledAt={ev.lastCulledAt?.toISOString?.() ?? null}
                      plan={plan}
                    />
                  )}
                  {section.id === "watermark" && (
                    <WatermarkSection
                      eventId={eventId}
                      plan={plan}
                      watermarkOverride={!!ev.watermarkOverride}
                      watermarkEnabled={ev.watermarkEnabled ?? true}
                      watermarkSource={ev.watermarkSource ?? "logo"}
                      watermarkPosition={ev.watermarkPosition ?? "BOTTOM_RIGHT"}
                      watermarkOpacity={ev.watermarkOpacity ?? 55}
                      studioWatermarkEnabled={studioProfile?.watermarkEnabled ?? true}
                      studioWatermarkPosition={studioProfile?.watermarkPosition ?? "BOTTOM_RIGHT"}
                      studioWatermarkOpacity={studioProfile?.watermarkOpacity ?? 55}
                      studioName={studioProfile?.studioName ?? "PhotoHouse"}
                      studioLogoUrl={studioLogoUrl}
                      firstPhotoUrl={pickerPhotos[0]?.thumbnailUrl ?? null}
                    />
                  )}
                  {section.id === "danger-zone" && (
                    <DangerZoneSection
                      eventId={eventId}
                      eventName={ev.name}
                      photoCount={totalPhotoCount}
                      linkCount={linksRaw.length}
                      isArchived={!!ev.isArchived}
                    />
                  )}
                  {section.id !== "event-details" &&
                    section.id !== "shared-links" &&
                    section.id !== "gallery" &&
                    section.id !== "photo-groups" &&
                    section.id !== "face-detection" &&
                    section.id !== "ai-culling" &&
                    section.id !== "watermark" &&
                    section.id !== "danger-zone" && (
                      <div className="min-h-[120px]" />
                    )}
            </div>

            {i < SECTIONS.length - 1 && (
              <hr className="my-10 border-zinc-200 dark:border-zinc-800" />
            )}
          </section>
        ))}
      </div>
    </SettingsShell>
  );
}
