import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { PhotoGrid } from "./PhotoGrid";
import { UploadModal } from "./UploadModal";
import { ShareModal } from "./ShareModal";
import { CoverPhotoUpload } from "./CoverPhotoUpload";
import { getCloudfrontSignedUrl } from "@/lib/cloudfront";

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

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, session] = await Promise.all([getServerT(), getServerSession(authOptions)]);
  if (!session) redirect("/login");

  const event = await db.event.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { createdAt: "desc" } },
      sharedLinks: {
        orderBy: { createdAt: "desc" },
        select: { id: true, slug: true, expiresAt: true, createdAt: true },
      },
      _count: { select: { photos: true } },
    },
  });

  if (!event || event.userId !== session.user.id) notFound();

  const totalSizeBytes = event.photos.reduce((s, p) => s + p.size, 0);

  const photosWithUrls = event.photos.map((photo) => ({
    ...photo,
    signedUrl: getCloudfrontSignedUrl(photo.s3Key),
  }));

  const coverSignedUrl = event.coverPhotoKey
    ? getCloudfrontSignedUrl(event.coverPhotoKey)
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/90">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">

            {/* Back + title */}
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
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {formatDate(event.date)}
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t.common.photoCount(event._count.photos)}
                  </span>
                  {totalSizeBytes > 0 && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {formatBytes(totalSizeBytes)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 items-center gap-2">
              <UploadModal eventId={id} />

              <ShareModal
                eventId={id}
                initialLinks={event.sharedLinks}
              />
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <p className="mt-2 ml-9 text-sm text-zinc-500 dark:text-zinc-400">
              {event.description}
            </p>
          )}
        </div>
      </header>

      {/* ── Cover photo ── */}
      <CoverPhotoUpload eventId={id} currentCoverUrl={coverSignedUrl} />

      {/* ── Main content ── */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <PhotoGrid photos={photosWithUrls} />
      </main>
    </div>
  );
}
