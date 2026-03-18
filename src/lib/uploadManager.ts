import { networkMonitor } from "@/lib/networkMonitor";
import { uploadFile } from "@/lib/uploadEngine";
import { concurrencyController } from "@/lib/concurrencyController";
import {
  initQueue,
  getPendingItems,
  getEventQueue,
  updateQueueItem,
  type QueueItem,
} from "@/lib/uploadQueue";

// ─── Config ───────────────────────────────────────────────────────────────────

/** How long to wait after coming back online before resuming uploads.
 *  Gives the connection time to stabilise before hammering S3. */
const RESUME_DELAY_MS = 2_000;

// ─── Toast helper ─────────────────────────────────────────────────────────────

type ToastType = "info" | "success" | "warning" | "error";

/**
 * Dispatches a `photoshare:toast` CustomEvent on window.
 * The UI layer (e.g. a <Toaster> component) listens for this event and renders
 * the notification — keeping UploadManager fully decoupled from React.
 */
function showToast(message: string, type: ToastType = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("photoshare:toast", { detail: { message, type } })
  );
}

// ─── UploadManager ────────────────────────────────────────────────────────────

export class UploadManager {
  private activeUploads = new Map<string, AbortController>();
  private isPaused      = false;
  private eventId:      string;

  /** Cleanup returned by networkMonitor.onStatusChange — null until start() runs. */
  private stopNetworkWatch: (() => void) | null = null;

  /** Timer id for the debounced resume-after-reconnect delay. */
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(eventId: string) {
    this.eventId = eventId;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Initialises IndexedDB, wires up the network-change subscription, and kicks
   * off any items that are already PENDING in the queue.
   *
   * Safe to call multiple times — the previous network subscription is cleaned
   * up before a new one is registered.
   */
  async start(): Promise<void> {
    await initQueue();

    // Items left as UPLOADING when the previous tab/session closed are
    // orphaned — their AbortControllers are gone and the S3 PUT is dead.
    // Reset them to PENDING so processQueue picks them up and resumes
    // from their last persisted completedParts.
    const stale = (await getEventQueue(this.eventId)).filter(
      (i: QueueItem) => i.status === "UPLOADING"
    );
    await Promise.all(
      stale.map((i: QueueItem) => updateQueueItem(i.id, { status: "PENDING" }))
    );

    // Replace any previous network subscription
    this.stopNetworkWatch?.();

    this.stopNetworkWatch = networkMonitor.onStatusChange((isOnline) => {
      if (!isOnline) {
        // Cancel a pending resume if we lose the connection again immediately
        if (this.resumeTimer !== null) {
          clearTimeout(this.resumeTimer);
          this.resumeTimer = null;
        }
        this.pauseAll();
      } else {
        // Wait briefly before resuming — connection may not yet be stable
        this.resumeTimer = setTimeout(() => {
          this.resumeTimer = null;
          this.resumeAll();
        }, RESUME_DELAY_MS);
      }
    });

    this.processQueue();
  }

  // ── Queue processing ───────────────────────────────────────────────────────

  /**
   * Fills available concurrency slots with PENDING items from IndexedDB.
   *
   * Each upload runs independently. On completion (DONE or PAUSED) or failure
   * (FAILED) the slot is released and processQueue is called again to pick up
   * the next item. This creates a self-replenishing pipeline up to MAX_CONCURRENT.
   */
  async processQueue(): Promise<void> {
    if (this.isPaused) return;

    // Re-check concurrency after the async DB read — the controller may have
    // changed its target between the check above and this point, and another
    // concurrent processQueue call may have already filled some slots.
    const pending = await getPendingItems(this.eventId);
    if (!concurrencyController.canStartNew(this.activeUploads.size) || pending.length === 0) return;

    const available = concurrencyController.getMaxConcurrent() - this.activeUploads.size;
    const toStart   = pending.slice(0, available);

    for (const item of toStart) {
      // Register the controller synchronously before any await so the
      // activeUploads size is accurate for concurrent processQueue calls.
      const controller = new AbortController();
      this.activeUploads.set(item.id, controller);

      // Mark UPLOADING in IndexedDB so polls / hooks see the state change
      // immediately, without waiting for uploadFile's own first write.
      await updateQueueItem(item.id, { status: "UPLOADING" });

      uploadFile(
        item,
        (_uploadedBytes, chunkBytes, durationMs) => {
          // Feed the chunk's transfer speed into the controller so it can
          // adapt the concurrency target in real time across the session.
          concurrencyController.measureSpeed(chunkBytes, durationMs);
        },
        controller.signal
      )
        .then(() => {
          // uploadFile resolves on both DONE and PAUSED (abort).
          // Only continue the pipeline if the manager itself isn't paused.
          this.activeUploads.delete(item.id);
          if (!this.isPaused) this.processQueue();
        })
        .catch(() => {
          // uploadFile has already set status → FAILED and recorded lastError.
          // Release the slot and try the next item in the queue.
          this.activeUploads.delete(item.id);
          if (!this.isPaused) this.processQueue();
        });
    }
  }

  // ── Pause / resume ─────────────────────────────────────────────────────────

  /**
   * Pauses all active uploads and prevents new ones from starting.
   * Each in-flight upload is aborted via its AbortController; uploadEngine
   * catches the AbortError and persists status → PAUSED to IndexedDB.
   *
   * A safety-net DB pass also flips any lingering UPLOADING rows to PAUSED
   * to cover the narrow race between abort() being called and the signal
   * being observed by uploadFile.
   */
  pauseAll(): void {
    this.isPaused = true;

    for (const [, controller] of this.activeUploads) {
      controller.abort();
    }
    // activeUploads entries are removed by the .then() handlers above once
    // each uploadFile promise resolves.

    // Safety net: items that haven't had a chance to observe the abort signal
    // yet could still be UPLOADING in the DB — flip them now.
    getEventQueue(this.eventId)
      .then((items) =>
        Promise.all(
          items
            .filter((i) => i.status === "UPLOADING")
            .map((i) => updateQueueItem(i.id, { status: "PAUSED" }))
        )
      )
      .catch(console.error);

    showToast("Upload paused — no internet connection", "warning");
  }

  /**
   * Resumes all PAUSED items by moving them back to PENDING and restarting
   * the queue processor.
   */
  resumeAll(): void {
    this.isPaused = false;

    getEventQueue(this.eventId)
      .then((items) =>
        Promise.all(
          items
            .filter((i) => i.status === "PAUSED")
            .map((i) => updateQueueItem(i.id, { status: "PENDING" }))
        )
      )
      .then(() => this.processQueue())
      .catch(console.error);

    showToast("Back online — resuming uploads", "success");
  }

  // ── Retry ──────────────────────────────────────────────────────────────────

  /**
   * Resets all FAILED items to PENDING and triggers the queue processor.
   *
   * Existing multipart state (uploadId, completedParts) is preserved so
   * uploadEngine can resume from the last successful chunk rather than
   * restarting the S3 upload from scratch.
   */
  retryFailed(): void {
    getEventQueue(this.eventId)
      .then((items) =>
        Promise.all(
          items
            .filter((i) => i.status === "FAILED")
            .map((i) =>
              updateQueueItem(i.id, {
                status: "PENDING",
                lastError: null,
              })
            )
        )
      )
      .then(() => this.processQueue())
      .catch(console.error);
  }
}

// ─── Singleton registry ───────────────────────────────────────────────────────

const managers = new Map<string, UploadManager>();

/**
 * Returns the UploadManager for the given event, creating it if needed.
 * One manager instance is shared across all components for the same event
 * so concurrent uploads and progress state remain consistent.
 *
 * @example
 *   const manager = getUploadManager(eventId);
 *   await manager.start();
 */
export function getUploadManager(eventId: string): UploadManager {
  if (!managers.has(eventId)) {
    managers.set(eventId, new UploadManager(eventId));
  }
  return managers.get(eventId)!;
}
