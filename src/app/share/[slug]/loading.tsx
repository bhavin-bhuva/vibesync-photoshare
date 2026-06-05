// Skeleton for the public customer gallery

function Bone({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <div style={style} className={`g-shimmer animate-pulse rounded-lg ${className}`} />;
}

const SKELETON_HEIGHTS = [220, 180, 260, 200, 240, 170, 230, 195, 250, 185, 215, 165];

export default function GalleryLoading() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--g-bg, #09090b)' }}>
      {/* Header */}
      <header className="border-b" style={{ background: 'var(--g-surface, #18181b)', borderColor: 'var(--g-border, #27272a)' }}>
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3">
            <Bone className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Bone className="h-5 w-48" />
              <Bone className="h-3.5 w-72" />
            </div>
          </div>
        </div>
      </header>

      {/* Gallery */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Download all button placeholder */}
        <div className="mb-5 flex justify-end">
          <Bone className="h-9 w-44 rounded-lg" />
        </div>

        {/* Masonry grid */}
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
