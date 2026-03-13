import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCloudfrontSignedUrl } from "@/lib/cloudfront";
import { getServerT } from "@/lib/i18n/server";
import { SelectionCard } from "./SelectionCard";

export default async function SelectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, session] = await Promise.all([getServerT(), getServerSession(authOptions)]);
  if (!session) redirect("/login");

  const event = await db.event.findUnique({
    where: { id },
    select: { id: true, name: true, userId: true },
  });

  if (!event || event.userId !== session.user.id) notFound();

  // Fetch selections separately to keep the query clean and avoid select/include mixing
  const sharedLinks = await db.sharedLink.findMany({
    where: { eventId: id },
    select: {
      id: true,
      slug: true,
      photoSelections: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          customerName: true,
          customerEmail: true,
          customerNote: true,
          status: true,
          createdAt: true,
          sharedLinkId: true,
          selectedPhotos: {
            select: {
              id: true,
              note: true,
              photoSelectionId: true,
              photoId: true,
              photo: {
                select: { id: true, s3Key: true, filename: true },
              },
            },
          },
        },
      },
    },
  });

  // Clear the new-selections badge (non-blocking — ignore if column doesn't exist yet)
  db.event.update({ where: { id }, data: { hasNewSelections: false } }).catch(() => {});

  // Flatten selections across all shared links, attach signed URLs, sort newest first
  const selections = (
    await Promise.all(
      sharedLinks.flatMap((link) =>
        link.photoSelections.map(async (sel) => ({
          ...sel,
          sharedLink: { slug: link.slug },
          selectedPhotos: await Promise.all(
            sel.selectedPhotos.map(async (sp) => ({
              ...sp,
              photo: {
                ...sp.photo,
                signedUrl: await getCloudfrontSignedUrl(sp.photo.s3Key),
              },
            }))
          ),
        }))
      )
    )
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingCount = selections.filter((s) => s.status === "PENDING").length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/90">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/events/${id}`}
              className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              aria-label={t.selections.backAriaLabel}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {t.selections.title}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {event.name}
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    {t.selections.pendingBadge(pendingCount)}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {selections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20 dark:border-zinc-700 dark:bg-zinc-800">
            <svg className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
            </svg>
            <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">
              {t.selections.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              {t.selections.emptySubtitle}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {selections.map((sel) => (
              <SelectionCard key={sel.id} selection={sel} eventId={id} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
