"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initQueue,
  addToQueue,
  updateQueueItem,
  getEventQueue,
  clearCompleted as dbClearCompleted,
  type QueueItem,
} from "@/lib/uploadQueue";

const POLL_INTERVAL_MS = 500;

export function useUploadQueue(eventId: string) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [ready, setReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Refresh ──────────────────────────────────────────────────────────────────
  // Memoised per eventId so the polling useEffect only restarts when needed.

  const refresh = useCallback(async () => {
    const queue = await getEventQueue(eventId);
    setItems(queue);
  }, [eventId]);

  // ── Init ─────────────────────────────────────────────────────────────────────
  // Run once on mount (and if refresh identity changes — i.e. eventId changed).

  useEffect(() => {
    let cancelled = false;

    initQueue()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        refresh().catch(console.error);
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // ── Polling ──────────────────────────────────────────────────────────────────
  // Starts as soon as the DB is ready. Clears and restarts whenever
  // `refresh` changes (= eventId changed) so we never poll the wrong event.

  useEffect(() => {
    if (!ready) return;

    intervalRef.current = setInterval(() => {
      refresh().catch(console.error);
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [ready, refresh]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const pending   = items.filter((i) => i.status === "PENDING");
  const uploading = items.filter((i) => i.status === "UPLOADING");
  const paused    = items.filter((i) => i.status === "PAUSED");
  const failed    = items.filter((i) => i.status === "FAILED");
  const done      = items.filter((i) => i.status === "DONE");

  const totalCount     = items.length;
  const completedCount = done.length;
  const failedCount    = failed.length;

  const totalBytes    = items.reduce((sum, i) => sum + i.size, 0);
  const uploadedBytes = items.reduce((sum, i) => sum + i.uploadedBytes, 0);
  const overallProgress =
    totalBytes === 0 ? 0 : Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));

  // ── Actions ──────────────────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (files: File[]): Promise<void> => {
      await Promise.all(files.map((file) => addToQueue(eventId, file)));
      await refresh();
    },
    [eventId, refresh]
  );

  const retryFailed = useCallback(async (): Promise<void> => {
    await Promise.all(
      failed.map((item) =>
        updateQueueItem(item.id, {
          status: "PENDING",
          progress: 0,
          uploadedBytes: 0,
          uploadId: null,
          completedParts: [],
          lastError: null,
        })
      )
    );
    await refresh();
  }, [failed, refresh]);

  const retryItem = useCallback(
    async (id: string): Promise<void> => {
      await updateQueueItem(id, {
        status: "PENDING",
        progress: 0,
        uploadedBytes: 0,
        uploadId: null,
        completedParts: [],
        lastError: null,
      });
      await refresh();
    },
    [refresh]
  );

  const clearCompleted = useCallback(async (): Promise<void> => {
    await dbClearCompleted(eventId);
    await refresh();
  }, [eventId, refresh]);

  // Fire-and-forget — callers don't need to await these.

  const pauseAll = useCallback((): void => {
    Promise.all(
      uploading.map((item) => updateQueueItem(item.id, { status: "PAUSED" }))
    )
      .then(refresh)
      .catch(console.error);
  }, [uploading, refresh]);

  const resumeAll = useCallback((): void => {
    Promise.all(
      paused.map((item) => updateQueueItem(item.id, { status: "PENDING" }))
    )
      .then(refresh)
      .catch(console.error);
  }, [paused, refresh]);

  // ── Return ───────────────────────────────────────────────────────────────────

  return {
    items,
    pending,
    uploading,
    failed,
    done,
    totalCount,
    completedCount,
    failedCount,
    totalBytes,
    uploadedBytes,
    overallProgress,
    addFiles,
    retryFailed,
    retryItem,
    clearCompleted,
    pauseAll,
    resumeAll,
  };
}
