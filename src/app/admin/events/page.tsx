import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

type SortCol = "name" | "date" | "createdAt" | "photos" | "links";
type SortDir = "asc" | "desc";

function buildOrderBy(col: string, dir: SortDir): Prisma.EventOrderByWithRelationInput {
  switch (col as SortCol) {
    case "name":      return { name: dir };
    case "date":      return { date: dir };
    case "photos":    return { photos: { _count: dir } };
    case "links":     return { sharedLinks: { _count: dir } };
    default:          return { createdAt: dir };
  }
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();

  const sp      = await searchParams;
  const search  = sp.q?.trim() ?? "";
  const sortBy  = sp.sort ?? "createdAt";
  const sortDir = (sp.dir === "asc" ? "asc" : "desc") as SortDir;
  const page    = Math.max(1, parseInt(sp.page ?? "1", 10));

  const where: Prisma.EventWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [events, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: buildOrderBy(sortBy, sortDir),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id:           true,
        name:         true,
        date:         true,
        createdAt:    true,
        coverPhotoKey: true,
        user: {
          select: { id: true, name: true, email: true, isSuspended: true },
        },
        _count: { select: { photos: true, sharedLinks: true } },
      },
    }),
    db.event.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function sortLink(col: string) {
    const newDir = sortBy === col && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams({
      ...(search && { q: search }),
      sort: col,
      dir: newDir,
    });
    return `?${params.toString()}`;
  }

  function pageLink(p: number) {
    const params = new URLSearchParams({
      ...(search && { q: search }),
      ...(sortBy !== "createdAt" && { sort: sortBy }),
      ...(sortDir !== "desc" && { dir: sortDir }),
      ...(p > 1 && { page: String(p) }),
    });
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  }

  function SortArrow({ col }: { col: string }) {
    if (sortBy !== col) return <span className="ml-1 text-zinc-300">↕</span>;
    return <span className="ml-1 text-blue-600">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const cols: { key: string; label: string; sortable: boolean }[] = [
    { key: "name",      label: "Event",       sortable: true  },
    { key: "name_ph",   label: "Photographer", sortable: false },
    { key: "date",      label: "Event Date",  sortable: true  },
    { key: "photos",    label: "Photos",      sortable: true  },
    { key: "links",     label: "Links",       sortable: true  },
    { key: "createdAt", label: "Created",     sortable: true  },
  ];

  return (
    <div className="space-y-5">

      {/* ── Search + count ── */}
      <div className="flex flex-wrap items-end gap-3">
        <form method="GET" className="relative min-w-[280px] flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
          </span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by event name or photographer…"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {/* Preserve sort params */}
          {sortBy !== "createdAt" && <input type="hidden" name="sort" value={sortBy} />}
          {sortDir !== "desc"     && <input type="hidden" name="dir"  value={sortDir} />}
        </form>
        <span className="text-xs text-zinc-400">
          {total.toLocaleString()} event{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {cols.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  {col.sortable ? (
                    <Link href={sortLink(col.key)} className="inline-flex items-center hover:text-zinc-800">
                      {col.label}
                      <SortArrow col={col.key} />
                    </Link>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {events.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-sm text-zinc-400">
                  No events found.
                </td>
              </tr>
            ) : events.map((event) => (
              <tr key={event.id} className="hover:bg-zinc-50/60">
                {/* Event name */}
                <td className="px-4 py-3">
                  <span className="font-medium text-zinc-900">{event.name}</span>
                  {event.coverPhotoKey && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                      cover
                    </span>
                  )}
                </td>

                {/* Photographer */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/admin/photographers/${event.user.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {event.user.name ?? event.user.email}
                    </Link>
                    {event.user.isSuspended && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                        suspended
                      </span>
                    )}
                  </div>
                  {event.user.name && (
                    <p className="text-xs text-zinc-400">{event.user.email}</p>
                  )}
                </td>

                {/* Event date */}
                <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                  {formatDate(event.date)}
                </td>

                {/* Photos */}
                <td className="px-4 py-3 tabular-nums text-zinc-600">
                  {event._count.photos.toLocaleString()}
                </td>

                {/* Shared links */}
                <td className="px-4 py-3 tabular-nums text-zinc-600">
                  {event._count.sharedLinks.toLocaleString()}
                </td>

                {/* Created */}
                <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                  {formatDate(event.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            Page {page} of {totalPages} · {total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-1">
            <Link
              href={pageLink(page - 1)}
              aria-disabled={page <= 1}
              className={`rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Prev
            </Link>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <Link
                  key={p}
                  href={pageLink(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    p === page
                      ? "bg-blue-600 text-white"
                      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
            <Link
              href={pageLink(page + 1)}
              aria-disabled={page >= totalPages}
              className={`rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
            >
              Next →
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
