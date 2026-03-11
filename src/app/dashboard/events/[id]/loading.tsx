// Skeleton for the event detail page

function Bone({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <div style={style} className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700 ${className}`} />;
}

// Simulate the masonry column layout with varied heights
const SKELETON_HEIGHTS = [200, 260, 180, 240, 210, 170, 250, 220, 190, 230, 160, 245];

export default function EventPageLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/90">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center gap-4">
            <Bone className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Bone className="h-5 w-48" />
              <Bone className="h-3.5 w-64" />
            </div>
            <div className="flex gap-2">
              <Bone className="h-9 w-32 rounded-lg" />
              <Bone className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      </header>

      {/* Cover photo */}
      <Bone className="h-[220px] w-full rounded-none" />

      {/* Photo grid */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div style={{ columns: "3 240px", gap: "14px" }}>
          {SKELETON_HEIGHTS.map((h, i) => (
            <div key={i} style={{ breakInside: "avoid", marginBottom: 14 }}>
              <Bone className="w-full rounded-xl" style={{ height: h } as React.CSSProperties} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
