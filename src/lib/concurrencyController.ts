// ─── Speed thresholds ─────────────────────────────────────────────────────────

const KB = 1_024;
const MB = 1_024 * KB;

const THRESHOLDS = [
  { limit: 500 * KB, concurrency: 1 }, // < 500 KB/s  — struggling
  { limit:   2 * MB, concurrency: 2 }, // < 2 MB/s    — moderate
  { limit:  10 * MB, concurrency: 3 }, // < 10 MB/s   — good
] as const;

const MAX_SAMPLES       = 5;
const MIN_CONCURRENCY   = 1;
const MAX_CONCURRENCY   = 5;
const DEFAULT_EXCELLENT = 5; // concurrency when speed exceeds all thresholds

// ─── ConcurrencyController ────────────────────────────────────────────────────

export class ConcurrencyController {
  private currentConcurrency = 3;
  private speedSamples: number[] = []; // bytes/sec, newest last

  // ── Measurement ─────────────────────────────────────────────────────────────

  /**
   * Records the transfer speed of a single chunk and adapts the concurrency
   * target. Should be called once per completed chunk.
   *
   * @param bytesTransferred - Exact byte count of the chunk that just finished.
   * @param durationMs       - Wall-clock time in ms that the chunk upload took.
   */
  measureSpeed(bytesTransferred: number, durationMs: number): void {
    if (durationMs <= 0 || bytesTransferred <= 0) return;

    const bytesPerSec = (bytesTransferred / durationMs) * 1_000;

    this.speedSamples.push(bytesPerSec);

    // Keep only the most recent 5 samples — older data is less relevant for
    // a connection that may be changing speed in real time.
    if (this.speedSamples.length > MAX_SAMPLES) {
      this.speedSamples.shift();
    }

    this.adjustConcurrency();
  }

  // ── Adjustment ──────────────────────────────────────────────────────────────

  /**
   * Recalculates `currentConcurrency` from the rolling average of speed samples.
   * Called automatically by measureSpeed; exposed publicly for testing.
   */
  adjustConcurrency(): void {
    if (this.speedSamples.length === 0) return;

    const avg =
      this.speedSamples.reduce((sum, s) => sum + s, 0) / this.speedSamples.length;

    let next = DEFAULT_EXCELLENT; // assume excellent until a threshold matches
    for (const { limit, concurrency } of THRESHOLDS) {
      if (avg < limit) {
        next = concurrency;
        break;
      }
    }

    this.currentConcurrency = Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, next));
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** Returns the current concurrency target. */
  getMaxConcurrent(): number {
    return this.currentConcurrency;
  }

  /**
   * Returns true when a new upload can be started without exceeding the
   * current concurrency target.
   *
   * @param activeCount - Number of uploads currently in-flight.
   */
  canStartNew(activeCount: number): boolean {
    return activeCount < this.currentConcurrency;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const concurrencyController = new ConcurrencyController();
