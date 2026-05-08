"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExifData {
  cameraMake?: string | null;
  cameraModel?: string | null;
  focalLength?: number | null;
  aperture?: number | null;
  shutterSpeed?: string | null;
  iso?: number | null;
}

interface Props {
  filename: string;
  size: number;
  createdAt: Date;
  width?: number | null;
  height?: number | null;
  group?: { name: string; color?: string | null } | null;
  exifData?: ExifData | null;
  onDownload?: () => void;
  downloading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LightboxInfoPanel({
  filename,
  size,
  createdAt,
  width,
  height,
  group,
  exifData,
  onDownload,
  downloading = false,
}: Props) {
  const hasCamera = !!(exifData && (exifData.cameraMake || exifData.cameraModel));
  const hasTechRow = !!(exifData && (
    exifData.focalLength != null ||
    exifData.aperture != null ||
    exifData.shutterSpeed ||
    exifData.iso != null
  ));
  const hasExif = hasCamera || hasTechRow;

  const techParts = exifData ? [
    exifData.focalLength != null ? `${exifData.focalLength}mm` : null,
    exifData.aperture   != null ? `f/${exifData.aperture}` : null,
    exifData.shutterSpeed       ? `${exifData.shutterSpeed}s` : null,
    exifData.iso        != null ? `ISO ${exifData.iso}` : null,
  ].filter(Boolean) : [];

  return (
    <div className="bg-zinc-950/95 px-4 py-4 backdrop-blur-md">

      {/* ── File info ── */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="mt-px shrink-0 text-[13px]" aria-hidden="true">📄</span>
          <p className="break-all text-[13px] font-medium text-white leading-snug">{filename}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[13px]" aria-hidden="true">📦</span>
          <p className="text-[13px] text-white/70">
            {formatBytes(size)}
            {width && height ? (
              <>
                <span className="mx-1.5 text-white/30">•</span>
                {width.toLocaleString()} × {height.toLocaleString()} px
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[13px]" aria-hidden="true">📅</span>
          <p className="text-[13px] text-white/70">{formatDateTime(createdAt)}</p>
        </div>
      </div>

      {/* ── Group ── */}
      {group && (
        <>
          <div className="my-3 border-t border-white/10" />
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: group.color ?? "#6366f1" }}
            />
            <span className="text-[13px] text-white/80">{group.name}</span>
          </div>
        </>
      )}

      {/* ── Camera / EXIF ── */}
      {hasExif && (
        <>
          <div className="my-3 border-t border-white/10" />
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Camera
          </p>
          {hasCamera && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[13px]" aria-hidden="true">📷</span>
              <p className="text-[13px] text-white/80">
                {[exifData!.cameraMake, exifData!.cameraModel].filter(Boolean).join(" ")}
              </p>
            </div>
          )}
          {hasTechRow && (
            <div className="mt-1 flex items-center gap-2">
              <span className="shrink-0 text-[13px]" aria-hidden="true">🔭</span>
              <p className="text-[13px] text-white/70">{techParts.join("  ")}</p>
            </div>
          )}
        </>
      )}

      {/* ── Download ── */}
      {onDownload && (
        <>
          <div className="my-3 border-t border-white/10" />
          <button
            onClick={onDownload}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20 active:bg-white/25 disabled:opacity-50"
          >
            {downloading ? <SpinnerIcon /> : <DownloadIcon />}
            {downloading ? "Preparing…" : `Download (${formatBytes(size)})`}
          </button>
        </>
      )}

    </div>
  );
}
