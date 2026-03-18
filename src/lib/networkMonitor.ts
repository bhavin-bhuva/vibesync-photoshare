// ─── NetworkMonitor ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS  = 5_000;
const PING_URL         = "/api/ping";

class NetworkMonitor extends EventTarget {
  isOnline: boolean;

  constructor() {
    super();

    // Guard: this module may be imported during SSR where window/navigator
    // do not exist. In that context the monitor is inert — all behaviour
    // lives on the client side anyway.
    if (typeof window === "undefined") {
      this.isOnline = true; // safe server-side default
      return;
    }

    this.isOnline = navigator.onLine;

    // ── Browser connectivity events ────────────────────────────────────────
    // navigator.onLine / the online/offline events are a first signal but are
    // known to lie (e.g. connected to a router with no WAN). They are used as
    // a fast trigger; the periodic probe below acts as the source of truth.

    window.addEventListener("online",  () => this._setOnline(true));
    window.addEventListener("offline", () => this._setOnline(false));

    // ── Periodic probe ────────────────────────────────────────────────────
    // Only fires when we think we're online; catches the case where
    // navigator.onLine is true but there is no actual internet path.
    setInterval(() => this._probe(), POLL_INTERVAL_MS);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _setOnline(next: boolean): void {
    if (next === this.isOnline) return; // no change — don't spam listeners
    this.isOnline = next;
    this.dispatchEvent(
      new CustomEvent("statuschange", { detail: { isOnline: this.isOnline } })
    );
  }

  private async _probe(): Promise<void> {
    // Only probe when we believe we're online — we're trying to catch the
    // "navigator says online but WAN is gone" scenario, not poll during a
    // known outage (recovery is signalled by the 'online' window event).
    if (!this.isOnline) return;

    try {
      const response = await fetch(PING_URL, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`Ping returned HTTP ${response.status}`);

      // Probe succeeded — already online, nothing to update.
    } catch {
      // Probe failed despite navigator.onLine being true.
      this._setOnline(false);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Subscribes to connectivity changes.
   * Returns a cleanup function that removes the listener — suitable for use
   * in useEffect return values or AbortController cleanup handlers.
   *
   * @example
   *   const off = networkMonitor.onStatusChange((online) => { ... });
   *   return off; // inside useEffect
   */
  onStatusChange(callback: (isOnline: boolean) => void): () => void {
    const handler = (e: Event) => {
      callback((e as CustomEvent<{ isOnline: boolean }>).detail.isOnline);
    };

    this.addEventListener("statuschange", handler);
    return () => this.removeEventListener("statuschange", handler);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const networkMonitor = new NetworkMonitor();
