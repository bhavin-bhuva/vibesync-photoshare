import {
  createMultipartUpload,
  getChunkPresignedUrl,
  completeMultipartUpload,
  type CompletedPart,
} from "@/lib/multipart";
import { updateQueueItem, type QueueItem } from "@/lib/uploadQueue";
import { withRetry, UploadError } from "@/lib/retryEngine";

// ─── Constants ────────────────────────────────────────────────────────────────

const RETRY_OPTIONS = {
  maxRetries:  5,
  baseDelayMs: 2000,
  maxDelayMs:  30000,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates how many bytes have already been uploaded based on the parts
 * that are recorded as complete. Uses the exact byte-range of each part
 * rather than assuming all parts are chunkSize — the last part is smaller.
 */
function bytesFromCompletedParts(
  completedParts: CompletedPart[],
  chunkSize: number,
  totalSize: number
): number {
  return completedParts.reduce((sum, part) => {
    const i     = part.PartNumber - 1; // PartNumber is 1-indexed
    const start = i * chunkSize;
    const end   = Math.min(start + chunkSize, totalSize);
    return sum + (end - start);
  }, 0);
}

/**
 * Returns an onRetry callback bound to a specific queue item.
 * Fires-and-forgets a DB update on each automatic retry so the UI always
 * shows the latest error message and an up-to-date retry counter.
 */
function makeOnRetry(itemId: string, baseRetryCount: number) {
  return (attempt: number, error: Error, delayMs: number): void => {
    updateQueueItem(itemId, {
      lastError:  `[retry ${attempt}] ${error.message} — waiting ${delayMs}ms`,
      retryCount: baseRetryCount + attempt,
    }).catch(console.error);
  };
}

// ─── Core upload function ─────────────────────────────────────────────────────

/**
 * Uploads a single file to S3 using the multipart API.
 *
 * - Resumes automatically if item.uploadId is already set (previous attempt
 *   was paused or interrupted mid-flight).
 * - Wraps every network call in withRetry (exponential backoff with full jitter).
 * - On abort signal: persists current completedParts and sets status PAUSED.
 *   The S3 multipart session is intentionally left open for later resumption.
 * - On non-retryable or exhausted-retry error: sets FAILED, records lastError,
 *   and rethrows so the caller can surface the failure.
 */
export async function uploadFile(
  item: QueueItem,
  onProgress: (uploadedBytes: number, chunkBytes: number, durationMs: number) => void,
  signal: AbortSignal
): Promise<void> {
  const onRetry = makeOnRetry(item.id, item.retryCount);

  // ── 1. Mark as uploading ───────────────────────────────────────────────────

  await updateQueueItem(item.id, { status: "UPLOADING" });

  // ── 2. Initialize or resume the S3 multipart session ──────────────────────

  let { uploadId, s3Key, photoId } = item;

  if (!uploadId) {
    // Wrap the server action call — retries on transient network failures.
    // Returned { error } strings are application errors, not retried.
    const result = await withRetry(
      () => createMultipartUpload(item.eventId, item.filename, item.mimeType, item.size),
      { ...RETRY_OPTIONS, signal, onRetry }
    );

    if ("error" in result) {
      // Storage limit and similar permanent errors — go straight to FAILED
      await updateQueueItem(item.id, { status: "FAILED", lastError: result.error });
      throw new UploadError(result.error, null, false);
    }

    uploadId = result.uploadId;
    s3Key    = result.s3Key;
    photoId  = result.photoId;

    // Persist immediately so we can resume if the tab closes before any chunk finishes
    await updateQueueItem(item.id, { uploadId, s3Key, photoId });
  }

  // ── 3. Calculate chunks ────────────────────────────────────────────────────

  const { chunkSize } = item;
  const totalChunks = Math.ceil(item.size / chunkSize);

  // Part numbers that are already done — skip on resume
  const donePartNumbers = new Set(item.completedParts.map((p) => p.PartNumber));

  // Running copy of completedParts — appended to as chunks finish
  const completedParts: CompletedPart[] = [...item.completedParts];

  // Seed uploaded bytes from any already-completed parts
  let uploadedBytes = bytesFromCompletedParts(completedParts, chunkSize, item.size);

  // ── 4. Upload each remaining chunk ────────────────────────────────────────

  try {
    for (let i = 0; i < totalChunks; i++) {
      const partNumber = i + 1; // S3 PartNumber is 1-indexed

      if (donePartNumbers.has(partNumber)) continue; // already uploaded in a previous attempt

      // Check abort before beginning a new chunk — avoid starting work we'll discard
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const start = i * chunkSize;
      const end   = Math.min(start + chunkSize, item.size);
      const chunk = item.file.slice(start, end);

      // Get the presigned URL and PUT the chunk in a single withRetry scope.
      // On retry the presigned URL is refreshed too — avoids using a potentially
      // stale URL if the first attempt waited through a backoff delay.
      const chunkStart = Date.now();
      const etag = await withRetry(
        async () => {
          // Get a fresh presigned URL for this exact part
          const urlResult = await getChunkPresignedUrl(s3Key!, uploadId!, partNumber);
          if ("error" in urlResult) {
            throw new UploadError(urlResult.error, null, false); // not retryable
          }

          // PUT the chunk — pass the signal so an abort cancels the in-flight request
          const response = await fetch(urlResult.presignedUrl, {
            method: "PUT",
            body: chunk,
            signal,
          });

          if (!response.ok) {
            throw UploadError.fromResponse(
              response.status,
              `Part ${partNumber} upload failed with HTTP ${response.status}`
            );
          }

          // S3 returns the part's ETag in the response header — required for CompleteMultipartUpload
          const etagValue = response.headers.get("ETag");
          if (!etagValue) {
            throw new UploadError(`S3 did not return an ETag for part ${partNumber}`, null, false);
          }

          return etagValue;
        },
        { ...RETRY_OPTIONS, signal, onRetry }
      );

      // Record this part and keep the array sorted (S3 requires ascending PartNumber order)
      completedParts.push({ PartNumber: partNumber, ETag: etag });
      completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

      const chunkDurationMs = Date.now() - chunkStart;
      const chunkBytes      = end - start;

      // Accumulate progress
      uploadedBytes += chunkBytes;

      // Persist after every chunk — this is what makes resume possible
      await updateQueueItem(item.id, {
        completedParts,
        uploadedBytes,
        progress: Math.round((uploadedBytes / item.size) * 100),
      });

      onProgress(uploadedBytes, chunkBytes, chunkDurationMs);
    }
  } catch (err) {
    // AbortError → user paused; preserve progress so the upload can be resumed
    if ((err as DOMException).name === "AbortError") {
      await updateQueueItem(item.id, { status: "PAUSED", completedParts });
      return;
    }

    // All other errors (including exhausted retries) → FAILED.
    // completedParts is saved so a manual retry via retryItem can resume
    // from the last successful chunk rather than starting over.
    // The S3 multipart session is left alive intentionally.
    const message = err instanceof Error ? err.message : String(err);
    await updateQueueItem(item.id, {
      status: "FAILED",
      lastError: message,
      completedParts,
      retryCount: item.retryCount + 1,
    });
    throw err;
  }

  // ── 5. Final abort check before committing ────────────────────────────────
  // All chunks uploaded but the signal fired between the last chunk write
  // and the CompleteMultipartUpload call.

  if (signal.aborted) {
    await updateQueueItem(item.id, { status: "PAUSED", completedParts });
    return;
  }

  // ── 6. Complete the multipart upload ──────────────────────────────────────

  const completeResult = await withRetry(
    () =>
      completeMultipartUpload(
        s3Key!,
        uploadId!,
        completedParts,
        photoId!,
        item.size,
        null, // width — not available without Canvas decode; can be supplied by callers later
        null  // height — same reasoning
      ),
    { ...RETRY_OPTIONS, signal, onRetry }
  );

  if ("error" in completeResult) {
    await updateQueueItem(item.id, {
      status: "FAILED",
      lastError: completeResult.error,
      retryCount: item.retryCount + 1,
    });
    throw new UploadError(completeResult.error, null, false);
  }

  await updateQueueItem(item.id, {
    status: "DONE",
    progress: 100,
    uploadedBytes: item.size,
    completedAt: Date.now(),
  });
}
