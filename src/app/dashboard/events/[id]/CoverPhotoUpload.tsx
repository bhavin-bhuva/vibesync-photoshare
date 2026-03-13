"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPresignedCoverUploadUrl } from "@/lib/s3";
import { setCoverPhotoAction } from "./actions";
import { useT } from "@/lib/i18n";

function CameraIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
    </svg>
  );
}

export function CoverPhotoUpload({
  eventId,
  currentCoverUrl,
}: {
  eventId: string;
  currentCoverUrl: string | null;
}) {
  // Optimistic preview — replaced with the server-refreshed URL after upload
  const t = useT();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const displayUrl = previewUrl ?? currentCoverUrl;
  const hasCover = Boolean(displayUrl);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError(t.coverPhoto.errorInvalidFile);
      return;
    }

    // Show an instant local preview while the upload is in-flight
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    setError("");

    try {
      // 1. Get presigned PUT URL
      const presigned = await getPresignedCoverUploadUrl(eventId, file.name, file.type, file.size);
      if ("error" in presigned) throw new Error(presigned.error);

      // 2. PUT to S3
      const res = await fetch(presigned.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status}).`);

      // 3. Save the key to the DB
      const saved = await setCoverPhotoAction(eventId, presigned.key);
      if (saved.error) throw new Error(saved.error);

      // Refresh server data — the page will re-render with the real signed URL
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPreviewUrl(null); // revert optimistic preview on error
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
      // Reset file input so the same file can be re-selected after an error
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="group relative w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/60"
      style={{ height: 220 }}
    >
      {/* ── Cover image or placeholder ── */}
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={t.coverPhoto.altText}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 border-b border-dashed border-zinc-300 dark:border-zinc-700">
          <svg className="h-10 w-10 text-zinc-300 dark:text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
            <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
          </svg>
          <p className="text-sm text-zinc-400">{t.coverPhoto.noCover}</p>
        </div>
      )}

      {/* Uploading progress overlay */}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-medium text-zinc-900">
            <SpinnerIcon />
            {t.coverPhoto.uploading}
          </div>
        </div>
      )}

      {/* ── Change / Add button — visible on hover ── */}
      {!uploading && (
        <button
          onClick={() => inputRef.current?.click()}
          className={`absolute flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-sm transition-all
            ${hasCover
              ? "bottom-3 right-3 bg-black/50 text-white opacity-0 hover:bg-black/70 group-hover:opacity-100"
              : "bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-700 dark:text-zinc-200 dark:ring-zinc-600"
            }`}
        >
          <CameraIcon />
          {hasCover ? t.coverPhoto.changeButton : t.coverPhoto.addButton}
        </button>
      )}

      {/* Error */}
      {error && (
        <p className="absolute bottom-3 left-3 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white">
          {error}
        </p>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
