import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { PhotoGrid, type GroupFilterOption } from "./PhotoGrid";
import { UploadModal, type GroupOption } from "./UploadModal";
import { ShareModal, type SharedLinkRow } from "./ShareModal";
import { CoverPhotoUpload } from "./CoverPhotoUpload";
import { PeopleTab, type ClusterCardData, type ActiveJobData } from "./PeopleTab";
import { EventMoreMenu } from "./EventMoreMenu";
import { getCloudfrontSignedUrl, getCloudfrontPreviewUrl } from "@/lib/cloudfront";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const PAGE_SIZE = 50;

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string; tab?: string; group?: string }>;
}) {
  const [{ id }, { cursor, tab, group }] = await Promise.all([params, searchParams]);
  const activeTab = tab === "people" ? "people" : "photos";
  const [t, session] = await Promise.all([getServerT(), getServerSession(authOptions)]);
  if (!session) redirect("/login");

  const [event, pendingSelectionsCount, photos, totalSizeAgg, groups, ungroupedCount, clusters, activeJob, photosAnalyzed] =
    await Promise.all([
      db.event.findUnique({
        where: { id },
        include: {
          sharedLinks: {
            orderBy: { createdAt: "desc" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            select: { id: true, slug: true, expiresAt: true, createdAt: true, accessType: true, faceSearchEnabled: true } as any,
          },
          _count: { select: { photos: true } },
        },
      }),
      db.photoSelection.count({
        where: { status: "PENDING", sharedLink: { eventId: id } },
      }),
      db.photo.findMany({
        where: { eventId: id },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
      db.photo.aggregate({
        where: { eventId: id },
        _sum: { size: true },
      }),
      db.photoGroup.findMany({
        where: { eventId: id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, color: true, isVisible: true, photoCount: true },
      }),
      db.photo.count({ where: { eventId: id, groupId: null } }),
      // People tab — always fetch so tab switch is instant
      db.faceCluster.findMany({
        where: { eventId: id },
        orderBy: { photoCount: "desc" },
        select: {
          id: true,
          label: true,
          coverCropS3Key: true,
          photoCount: true,
          faceCount: true,
          isHidden: true,
        },
      }),
      db.faceIndexingJob.findFirst({
        where: { eventId: id, status: { in: ["PENDING", "RUNNING", "CLUSTERING"] } },
        orderBy: { createdAt: "desc" },
        select: { status: true, processedPhotos: true, totalPhotos: true, facesFound: true },
      }),
      db.faceRecord.groupBy({
        by: ["photoId"],
        where: { eventId: id },
      }).then((rows) => rows.length),
    ]);

  if (!event || event.userId !== session.user.id) notFound();

  const nextCursor = photos.length === PAGE_SIZE ? photos[photos.length - 1].id : null;
  const totalSizeBytes = totalSizeAgg._sum.size ?? 0;

  const [photosWithUrls, coverSignedUrl, clustersWithUrls] = await Promise.all([
    Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbnailUrl: (photo as any).thumbS3Key
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? await getCloudfrontSignedUrl((photo as any).thumbS3Key)
          : await getCloudfrontPreviewUrl(photo.s3Key, 800),
      }))
    ),
    event.coverPhotoKey ? getCloudfrontSignedUrl(event.coverPhotoKey) : null,
    Promise.all(
      clusters.map(async (c): Promise<ClusterCardData> => ({
        id: c.id,
        label: c.label,
        coverCropUrl: getCloudfrontSignedUrl(c.coverCropS3Key) ?? "",
        photoCount: c.photoCount,
        faceCount: c.faceCount,
        isHidden: c.isHidden,
      }))
    ),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceIndexingEnabled = !!((event as any).faceIndexingEnabled as boolean | undefined);
  const faceIndexingDone = !activeJob && clusters.length > 0;
  const totalFacesFound = clusters.reduce((s, c) => s + c.faceCount, 0);
  const activeJobData: ActiveJobData = activeJob
    ? { ...activeJob, status: activeJob.status as string }
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/90">

        {/* ── Desktop header (sm+) ── */}
        <div className="mx-auto hidden max-w-6xl px-6 py-4 sm:block">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Link
                href="/dashboard"
                className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                aria-label={t.nav.backToDashboard}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {event.name}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">{formatDate(event.date)}</span>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">{t.common.photoCount(event._count.photos)}</span>
                  {groups.length > 0 && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">{groups.length} {groups.length === 1 ? "group" : "groups"}</span>
                    </>
                  )}
                  {totalSizeBytes > 0 && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">{formatBytes(totalSizeBytes)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/dashboard/events/${id}/selections`}
                className="relative flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
                {t.eventPage.selectionsButton}
                {pendingSelectionsCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {pendingSelectionsCount}
                  </span>
                )}
              </Link>
              <UploadModal eventId={id} groups={groups as GroupOption[]} />
              <ShareModal
                eventId={id}
                initialLinks={event.sharedLinks as unknown as SharedLinkRow[]}
                faceIndexingEnabled={faceIndexingEnabled}
                faceIndexingDone={faceIndexingDone}
                peopleIndexed={clusters.length}
                groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color ?? null }))}
              />
            </div>
          </div>
          {event.description && (
            <p className="mt-2 ml-9 text-sm text-zinc-500 dark:text-zinc-400">{event.description}</p>
          )}
        </div>

        {/* ── Mobile header (< sm) ── */}
        <div className="space-y-2 px-4 py-3 sm:hidden">
          {/* Row 1: Back + title */}
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/dashboard"
              className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              aria-label={t.nav.backToDashboard}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="min-w-0 truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {event.name}
            </h1>
          </div>

          {/* Row 2: Stats */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[13px] text-zinc-500 dark:text-zinc-400">
            <span>{t.common.photoCount(event._count.photos)}</span>
            {groups.length > 0 && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>{groups.length} {groups.length === 1 ? "group" : "groups"}</span>
              </>
            )}
            {totalSizeBytes > 0 && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>{formatBytes(totalSizeBytes)}</span>
              </>
            )}
          </div>

          {/* Row 3: Action buttons */}
          <div className="flex gap-2">
            <UploadModal
              eventId={id}
              groups={groups as GroupOption[]}
              triggerClassName="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            />
            <ShareModal
              eventId={id}
              initialLinks={event.sharedLinks as unknown as SharedLinkRow[]}
              faceIndexingEnabled={faceIndexingEnabled}
              faceIndexingDone={faceIndexingDone}
              peopleIndexed={clusters.length}
              groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color ?? null }))}
              triggerClassName="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            />
            <EventMoreMenu eventId={id} pendingCount={pendingSelectionsCount} />
          </div>
        </div>

      </header>

      {/* ── Cover photo ── */}
      <CoverPhotoUpload eventId={id} currentCoverUrl={coverSignedUrl} />

      {/* ── Tab bar ── */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto flex max-w-6xl gap-1 px-3 sm:px-6">
          <Link
            href={`/dashboard/events/${id}${group ? `?group=${group}` : ""}`}
            className={`-mb-px flex min-h-[44px] items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
              activeTab === "photos"
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {/* Camera icon — mobile only */}
            <svg className="h-4 w-4 shrink-0 sm:hidden" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
              <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
            </svg>
            <span className="hidden sm:inline">{t.eventPage.tabPhotos}</span>
            <span className="sr-only sm:hidden">{t.eventPage.tabPhotos}</span>
            <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 sm:inline">
              {event._count.photos}
            </span>
          </Link>
          <Link
            href={`/dashboard/events/${id}?tab=people${group ? `&group=${group}` : ""}`}
            className={`-mb-px flex min-h-[44px] items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-3 ${
              activeTab === "people"
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {/* Person icon — mobile only */}
            <svg className="h-4 w-4 shrink-0 sm:hidden" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">{t.eventPage.tabPeople}</span>
            <span className="sr-only sm:hidden">{t.eventPage.tabPeople}</span>
            {clusters.length > 0 && (
              <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 sm:inline">
                {clusters.length}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        {activeTab === "photos" ? (
          <>
            <PhotoGrid
              photos={photosWithUrls}
              eventId={id}
              groups={groups as GroupFilterOption[]}
              ungroupedCount={ungroupedCount}
              totalPhotoCount={event._count.photos}
              initialGroupFilter={group ?? "all"}
            />
            {nextCursor && (
              <div className="mt-8 flex justify-center">
                <Link
                  href={`/dashboard/events/${id}?cursor=${nextCursor}`}
                  className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {t.eventPage.loadMore}
                </Link>
              </div>
            )}
          </>
        ) : (
          <PeopleTab
            eventId={id}
            faceIndexingEnabled={faceIndexingEnabled}
            clusters={clustersWithUrls}
            activeJob={activeJobData}
            totalPhotoCount={event._count.photos}
            stats={{
              people: clusters.length,
              photosAnalyzed: photosAnalyzed,
              facesFound: totalFacesFound,
            }}
          />
        )}
      </main>
    </div>
  );
}
