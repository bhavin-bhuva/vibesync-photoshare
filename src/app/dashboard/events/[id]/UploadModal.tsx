"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDropzone, type FileRejection } from "react-dropzone";
import Link from "next/link";
import { getPresignedUploadUrl } from "@/lib/s3";
import { savePhotoRecord, getStorageStatus } from "./actions";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileStatus = "pending" | "uploading" | "done" | "error";

interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number; // 0–100
  error?: string;
  exceedsLimit?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_CONCURRENT = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

/** PUT a file to S3 via XHR so we get upload progress events. */
function xhrUpload(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    signal.addEventListener("abort", () => {
      xhr.abort();
      reject(new DOMException("Upload aborted", "AbortError"));
    });

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 responded ${xhr.status}`));
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new DOMException("Upload aborted", "AbortError")));

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

// ─── Status icons ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "uploading")
    return (
      <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3v4a8 8 0 1 0 8 8h-4l3 3 3-3h-4a8 8 0 0 1-8 8A8 8 0 0 1 4 12Z" />
      </svg>
    );
  if (status === "done")
    return (
      <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
      </svg>
    );
  if (status === "error")
    return (
      <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    );
  // pending
  return <div className="h-4 w-4 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadModal({ eventId }: { eventId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Storage state: null = loading, number = bytes available, -1 = error fetching
  const [availableBytes, setAvailableBytes] = useState<number | null>(null);
  const [storageFull, setStorageFull] = useState(false);

  // Fetch storage status on modal open
  useEffect(() => {
    if (!open) return;
    setAvailableBytes(null);
    setStorageFull(false);
    getStorageStatus().then((res) => {
      if ("error" in res) { setAvailableBytes(-1); return; }
      setStorageFull(res.percentUsed >= 100);
      setAvailableBytes(res.availableBytes);
    });
  }, [open]);

  const uploadableFiles = files.filter((f) => !f.exceedsLimit);
  const exceededFiles   = files.filter((f) => f.exceedsLimit);
  const doneCount  = uploadableFiles.filter((f) => f.status === "done").length;
  const errorCount = uploadableFiles.filter((f) => f.status === "error").length;
  const allSettled = uploadableFiles.length > 0 &&
    uploadableFiles.every((f) => f.status === "done" || f.status === "error");

  // ── Dropzone ──
  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setFiles((prev) => {
        // Bytes already committed by pending (non-exceeded) files in the queue
        const alreadyQueued = prev
          .filter((f) => f.status === "pending" && !f.exceedsLimit)
          .reduce((s, f) => s + f.file.size, 0);

        // available may still be loading (null) or errored (-1); treat both as unlimited
        // so we don't incorrectly block files before the fetch resolves.
        const budget = availableBytes !== null && availableBytes >= 0
          ? availableBytes - alreadyQueued
          : Infinity;

        let running = 0;
        const newFiles: UploadFile[] = accepted.map((file) => {
          running += file.size;
          return {
            id: uid(),
            file,
            status: "pending",
            progress: 0,
            exceedsLimit: running > budget,
          };
        });

        const errored: UploadFile[] = rejected.map(({ file, errors }: FileRejection) => ({
          id: uid(),
          file,
          status: "error",
          progress: 0,
          error: errors[0]?.message ?? "Rejected",
        }));

        return [...prev, ...newFiles, ...errored];
      });
    },
    [availableBytes]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE_BYTES,
    disabled: uploading || storageFull,
  });

  // ── Upload queue ──
  function updateFile(id: string, patch: Partial<UploadFile>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function uploadOne(item: UploadFile, signal: AbortSignal) {
    updateFile(item.id, { status: "uploading", progress: 0 });

    // 1. Get presigned URL from server
    const result = await getPresignedUploadUrl(eventId, item.file.name, item.file.type, item.file.size);
    if ("error" in result) {
      updateFile(item.id, { status: "error", error: result.error });
      return;
    }

    // 2. PUT directly to S3
    try {
      await xhrUpload(result.url, item.file, (pct) => updateFile(item.id, { progress: pct }), signal);
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
      updateFile(item.id, { status: "error", error: (err as Error).message });
      return;
    }

    // 3. Save Photo record to DB
    const save = await savePhotoRecord(eventId, result.key, item.file.name, item.file.size);
    if (save.error) {
      updateFile(item.id, { status: "error", error: save.error });
      return;
    }

    updateFile(item.id, { status: "done", progress: 100 });
  }

  async function startUploads() {
    const pending = files.filter((f) => f.status === "pending" && !f.exceedsLimit);
    if (pending.length === 0) return;

    const ac = new AbortController();
    abortRef.current = ac;
    setUploading(true);

    // Process in sliding window of MAX_CONCURRENT
    let i = 0;
    async function next(): Promise<void> {
      if (i >= pending.length) return;
      const item = pending[i++];
      await uploadOne(item, ac.signal);
      return next();
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pending.length) }, next));

    abortRef.current = null;
    setUploading(false);
  }

  function handleClose() {
    if (uploading) {
      abortRef.current?.abort();
      setUploading(false);
    }
    setOpen(false);
    setFiles([]);
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
        {t.eventPage.uploadButton}
      </button>

      {/* Modal — portalled to document.body to escape the header's backdrop-blur stacking context */}
      {open && createPortal(
        <div className="fixed inset-0 z-40 overflow-y-auto">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

          {/* Centering wrapper — min-h-full ensures short modals stay centred */}
          <div className="flex min-h-full items-center justify-center p-4">
          {/* Card */}
          <div className="relative z-50 flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-800" style={{ maxHeight: "90vh" }}>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {t.uploadModal.title}
              </h2>
              <button
                onClick={handleClose}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                aria-label={t.common.close_aria}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto p-6">
              {/* Dropzone */}
              <div className="relative">
                <div
                  {...getRootProps()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                    isDragActive
                      ? "border-zinc-500 bg-zinc-50 dark:border-zinc-400 dark:bg-zinc-700"
                      : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
                  } ${uploading || storageFull ? "pointer-events-none opacity-50" : ""}`}
                >
                  <input {...getInputProps()} />
                  <svg className="mb-3 h-10 w-10 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  {isDragActive ? (
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.uploadModal.dropzoneDragActive}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {t.uploadModal.dropzonePrompt} <span className="text-zinc-900 underline dark:text-zinc-50">{t.uploadModal.dropzoneBrowse}</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{t.uploadModal.dropzoneHint}</p>
                    </>
                  )}
                </div>

                {/* Storage-full overlay */}
                {storageFull && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-900/80 text-center">
                    <p className="text-sm font-medium text-white">
                      Storage full &mdash; upgrade to continue uploading
                    </p>
                    <Link
                      href="/pricing"
                      className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                    >
                      Upgrade plan
                    </Link>
                  </div>
                )}
              </div>

              {/* File list */}
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((item) => (
                    <li key={item.id} className={`rounded-lg px-3 py-2.5 ${item.exceedsLimit ? "bg-red-50 dark:bg-red-950/30" : "bg-zinc-50 dark:bg-zinc-700"}`}>
                      <div className="flex items-center gap-3">
                        <StatusIcon status={item.status} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {item.file.name}
                          </p>
                          <p className="text-xs text-zinc-400">{formatBytes(item.file.size)}</p>
                        </div>
                        {item.exceedsLimit && (
                          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/50 dark:text-red-400">
                            Exceeds storage limit
                          </span>
                        )}
                        {!item.exceedsLimit && item.status === "done" && (
                          <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">{t.uploadModal.statusDone}</span>
                        )}
                        {!item.exceedsLimit && item.status === "error" && (
                          <span className="shrink-0 text-xs text-red-500" title={item.error}>{t.uploadModal.statusFailed}</span>
                        )}
                        {!item.exceedsLimit && item.status === "uploading" && (
                          <span className="shrink-0 text-xs tabular-nums text-zinc-400">{item.progress}%</span>
                        )}
                      </div>

                      {/* Progress bar — visible while uploading */}
                      {(item.status === "uploading" || (item.status === "pending" && uploading)) && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-600">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-150"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}

                      {/* Error message */}
                      {item.status === "error" && item.error && (
                        <p className="mt-1 text-xs text-red-500">{item.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4 dark:border-zinc-700">
              {/* Summary */}
              <div className="flex flex-col gap-0.5">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {files.length === 0 && t.uploadModal.summaryNoFiles}
                  {files.length > 0 && !allSettled && !uploading && t.uploadModal.summaryReady(uploadableFiles.filter(f => f.status === "pending").length)}
                  {uploading && t.uploadModal.summaryUploading(doneCount, uploadableFiles.filter(f => f.status !== "error").length)}
                  {allSettled && t.uploadModal.summarySettled(doneCount, errorCount)}
                </p>
                {exceededFiles.length > 0 && !allSettled && (
                  <p className="text-xs text-red-500">
                    {uploadableFiles.filter(f => f.status === "pending").length} of {files.length} photos will be uploaded &mdash; storage limit reached for the rest.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {allSettled ? t.common.close : t.common.cancel}
                </button>
                {!allSettled && (
                  <button
                    onClick={startUploads}
                    disabled={uploading || uploadableFiles.filter((f) => f.status === "pending").length === 0}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {uploading ? t.uploadModal.submitting : t.uploadModal.submit(uploadableFiles.filter((f) => f.status === "pending").length || "")}
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>{/* end centering wrapper */}
        </div>,
        document.body
      )}
    </>
  );
}
