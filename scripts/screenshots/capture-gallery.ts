import { launchBrowser, newPage, loginAs, takeScreenshot } from "./browser";
import { SCREENSHOT_CONFIG } from "./config";
import type { Browser, Page } from "puppeteer";

const BASE = SCREENSHOT_CONFIG.baseUrl;
const HIDE = ['[class*="cookie"]', '[class*="toast"]'];

// ─── Helper: get first event ID (same pattern as capture-events.ts) ───────────

async function getFirstEventId(page: Page): Promise<string> {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[href*="/dashboard/events/"]', { timeout: 10_000 });
  const href = await page.$eval(
    '[href*="/dashboard/events/"]',
    (el) => el.getAttribute("href") ?? ""
  );
  const id = href.split("/events/")[1]?.split("/")[0];
  if (!id) throw new Error(`Could not extract event ID from href: ${href}`);
  return id;
}

// ─── Helper: open Share modal and extract the slug from the displayed URL ─────

async function getTestGallerySlug(browser: Browser): Promise<string> {
  const page = await newPage(browser, "desktop");
  try {
    await loginAs(page);
    const eventId = await getFirstEventId(page);
    await page.goto(`${BASE}/dashboard/events/${eventId}`);
    await page.waitForSelector('div[role="button"][tabindex="0"]', { timeout: 10_000 });

    // Open share modal
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim().includes("Share Event")
      );
      btn?.click();
    });

    // Wait for the share URL to appear inside the modal
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("p")).some((p) =>
          p.textContent?.includes("/share/")
        ),
      { timeout: 5_000 }
    );

    const slug = await page.evaluate((): string => {
      for (const el of document.querySelectorAll("p, span, a")) {
        const match = (el.textContent ?? "").match(/\/share\/([a-z0-9]+)/i);
        if (match) return match[1];
      }
      return "";
    });

    if (!slug) throw new Error("Could not find /share/ URL in Share modal");
    console.log(`📌 Gallery slug: ${slug}`);
    return slug;
  } finally {
    await page.close();
  }
}

// ─── Helper: authenticate gallery (submits PIN once, sets cookie for browser) ─

async function authenticateGallery(browser: Browser, slug: string): Promise<void> {
  const page = await newPage(browser, "desktop");
  try {
    await page.goto(`${BASE}/share/${slug}`);
    await page.waitForSelector('input[inputMode="numeric"]', { timeout: 8_000 });

    // Type each PIN digit — OtpInput auto-submits on the 4th digit
    const inputs = await page.$$('input[inputMode="numeric"]');
    if (inputs.length !== 4) throw new Error(`Expected 4 PIN inputs, got ${inputs.length}`);
    for (let i = 0; i < 4; i++) {
      await inputs[i].type("1234"[i]);
      await new Promise((r) => setTimeout(r, 120));
    }

    // After last digit, OtpInput fires onComplete → server action verifies PIN
    // and sets cookie → router.refresh() re-renders RSC (no navigation event).
    // Wait for gallery photo grid to appear (replaces PinForm after auth).
    await new Promise((r) => setTimeout(r, 3_000));
    await page.waitForFunction(
      () =>
        // Gallery content appears (photo cards or any non-pin element)
        document.querySelector('[class*="columns"]') !== null ||
        document.querySelector('img[src*="cloudfront"]') !== null ||
        // Fallback: pin inputs gone and some grid/main content appeared
        (document.querySelector('input[inputmode="numeric"]') === null &&
         document.querySelector('main') !== null),
      { timeout: 20_000 }
    );
    console.log("🔓 Gallery authenticated via PIN");
  } finally {
    await page.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function captureGallery() {
  const browser = await launchBrowser();

  try {
    // ── Resolve slug ──────────────────────────────────────────────────────────
    const slug     = await getTestGallerySlug(browser);
    const shareUrl = `${BASE}/share/${slug}`;

    // ── 1. PIN entry — desktop ────────────────────────────────────────────────
    const pinDesktop = await newPage(browser, "desktop");
    await pinDesktop.goto(shareUrl);
    await pinDesktop.waitForSelector('input[inputMode="numeric"]', { timeout: 8_000 });
    await takeScreenshot(pinDesktop, "gallery-pin-entry-desktop", {
      hideSelectors: HIDE,
    });
    await pinDesktop.close();

    // ── 2. PIN entry — mobile ─────────────────────────────────────────────────
    const pinMobile = await newPage(browser, "mobile");
    await pinMobile.goto(shareUrl);
    await pinMobile.waitForSelector('input[inputMode="numeric"]', { timeout: 8_000 });
    await takeScreenshot(pinMobile, "gallery-pin-entry-mobile", {
      hideSelectors: HIDE,
    });
    await pinMobile.close();

    // ── Authenticate once — cookie persists for all pages in this browser ─────
    await authenticateGallery(browser, slug);

    const photoWait = 'div[role="button"][tabindex="0"]';

    // ── 3. Gallery — desktop ──────────────────────────────────────────────────
    const galDesktop = await newPage(browser, "desktop");
    await galDesktop.goto(shareUrl);
    await galDesktop.waitForSelector(photoWait, { timeout: 10_000 });
    await takeScreenshot(galDesktop, "gallery-photos-desktop", {
      fullPage:      true,
      waitFor:       500,
      hideSelectors: HIDE,
    });

    // ── 4. Gallery — mobile ───────────────────────────────────────────────────
    const galMobile = await newPage(browser, "mobile");
    await galMobile.goto(shareUrl);
    await galMobile.waitForSelector(photoWait, { timeout: 10_000 });
    await takeScreenshot(galMobile, "gallery-photos-mobile", {
      fullPage:      true,
      waitFor:       500,
      hideSelectors: HIDE,
    });
    await galMobile.close();

    // ── 5. Group filter active ────────────────────────────────────────────────
    const clickedGroup = await galDesktop.evaluate(() => {
      const pills = Array.from(document.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() && !["View", "Select Photos", "All Photos"].some(
          (t) => b.textContent?.includes(t)
        )
      );
      // First pill that's not "All Photos" and contains a photo count (digit)
      const pill = pills.find((b) => /\d/.test(b.textContent ?? ""));
      if (pill) { pill.click(); return true; }
      return false;
    });
    if (clickedGroup) {
      await takeScreenshot(galDesktop, "gallery-group-filter-active", {
        waitFor:       500,
        hideSelectors: HIDE,
      });
      // Reset to "All Photos"
      await galDesktop.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.includes("All Photos")
        );
        all?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
    } else {
      console.warn("⚠️  No group filter pills found — skipping gallery-group-filter-active");
    }

    // ── 6. Density dense ─────────────────────────────────────────────────────
    const denseDone = await galDesktop.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Dense"]') as HTMLButtonElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (denseDone) {
      await takeScreenshot(galDesktop, "gallery-density-dense", {
        waitFor:       300,
        hideSelectors: HIDE,
      });
      // Reset density
      const defaultBtn = await galDesktop.$('button[aria-label="Default"]');
      if (defaultBtn) await defaultBtn.click();
    } else {
      console.warn("⚠️  Dense density button not found — skipping gallery-density-dense");
    }

    // ── 7. Find My Photos button ──────────────────────────────────────────────
    // faceSearchEnabled=false on the seed link — button will be absent.
    // Attempt gracefully; skip if not found.
    const hasFaceSearch = await galDesktop.evaluate(
      () => !!document.querySelector('button[aria-label="Find My Photos"]')
        || Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent?.includes("Find My Photos")
        )
    );
    if (hasFaceSearch) {
      await takeScreenshot(galDesktop, "gallery-find-my-photos-button", {
        hideSelectors: HIDE,
      });

      // ── 8. Face search modal ──────────────────────────────────────────────
      await galDesktop.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) =>
            b.textContent?.includes("Find My Photos") ||
            b.getAttribute("aria-label") === "Find My Photos"
        );
        btn?.click();
      });
      const modal = await galDesktop
        .waitForSelector('[role="dialog"], div[class*="fixed inset-0"]', { timeout: 3_000 })
        .catch(() => null);
      if (modal) {
        await takeScreenshot(galDesktop, "gallery-face-search-modal", {
          waitFor:       400,
          hideSelectors: HIDE,
        });
        await galDesktop.keyboard.press("Escape");
      }
    } else {
      console.warn(
        "⚠️  'Find My Photos' not visible (faceSearchEnabled=false on seed link). " +
        "Skipping gallery-find-my-photos-button and gallery-face-search-modal."
      );
    }

    // ── 9. Selection mode ─────────────────────────────────────────────────────
    const clickedSelect = await galDesktop.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Select Photos"
      );
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clickedSelect) {
      await new Promise((r) => setTimeout(r, 400));

      // Click 3 photo cards to select them
      const photos = await galDesktop.$$('div[role="button"][tabindex="0"]');
      const toSelect = photos.slice(0, Math.min(3, photos.length));
      for (const photo of toSelect) {
        await photo.click();
        await new Promise((r) => setTimeout(r, 200));
      }

      await takeScreenshot(galDesktop, "gallery-selection-mode", {
        waitFor:       300,
        hideSelectors: HIDE,
      });

      // ── 10. Selection submit bar ────────────────────────────────────────────
      // The sticky bar is at fixed bottom; tag it for element crop
      await galDesktop.evaluate(() => {
        const bar = document.querySelector('div[class*="fixed inset-x-0 bottom-0"]');
        if (bar) bar.setAttribute("data-ss", "selection-bar");
      });
      const hasBar = await galDesktop.$('[data-ss="selection-bar"]');
      if (hasBar) {
        // Expand bar to show full form
        await galDesktop.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Add details"
          );
          btn?.click();
        });
        await new Promise((r) => setTimeout(r, 300));
        await takeScreenshot(galDesktop, "gallery-selection-submit-bar", {
          selector:      '[data-ss="selection-bar"]',
          hideSelectors: HIDE,
        });
      } else {
        console.warn("⚠️  Selection bar not found — skipping gallery-selection-submit-bar");
      }

      // Exit selection mode
      await galDesktop.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.trim() === "View"
        );
        btn?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
    } else {
      console.warn("⚠️  'Select Photos' button not found — skipping selection screenshots");
    }

    // ── 11. Download options ──────────────────────────────────────────────────
    // "Download All (ZIP)" button is always in the gallery toolbar.
    // Tag the toolbar row for element crop.
    await galDesktop.evaluate(() => {
      const bar = Array.from(document.querySelectorAll("div")).find(
        (d) =>
          d.textContent?.includes("Download All") &&
          d.querySelectorAll("button").length > 0
      );
      if (bar) bar.setAttribute("data-ss", "download-bar");
    });
    const hasDownloadBar = await galDesktop.$('[data-ss="download-bar"]');
    if (hasDownloadBar) {
      await takeScreenshot(galDesktop, "gallery-download-options", {
        selector:      '[data-ss="download-bar"]',
        hideSelectors: HIDE,
      });
    } else {
      // Fallback: full viewport showing the toolbar area
      await takeScreenshot(galDesktop, "gallery-download-options", {
        hideSelectors: HIDE,
      });
    }

    await galDesktop.close();

    console.log("✅ Gallery screenshots complete");
  } finally {
    await browser.close();
  }
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureGallery().catch(console.error);
}
