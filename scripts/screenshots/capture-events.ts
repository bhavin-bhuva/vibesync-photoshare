import { launchBrowser, newPage, loginAs, takeScreenshot } from "./browser";
import { SCREENSHOT_CONFIG } from "./config";
import type { Page } from "puppeteer";

// ─── Helper: extract the first event ID from the dashboard ───────────────────

async function getFirstEventId(page: Page): Promise<string> {
  await page.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard`);
  await page.waitForSelector('[href*="/dashboard/events/"]', { timeout: 10_000 });
  const href = await page.$eval(
    '[href*="/dashboard/events/"]',
    (el) => el.getAttribute("href") ?? ""
  );
  const id = href.split("/events/")[1]?.split("/")[0];
  if (!id) throw new Error(`Could not extract event ID from href: ${href}`);
  return id;
}

// ─── Helper: click a button by its visible text ───────────────────────────────

async function clickButtonByText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t: string) => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim().includes(t)
    );
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function captureEvents() {
  const browser = await launchBrowser();

  try {
    // ── Resolve event ID once, reuse for all shots ────────────────────────────
    const idPage = await newPage(browser, "desktop");
    await loginAs(idPage);
    const eventId = await getFirstEventId(idPage);
    await idPage.close();
    console.log(`📌 Event ID: ${eventId}`);

    const eventUrl  = `${SCREENSHOT_CONFIG.baseUrl}/dashboard/events/${eventId}`;
    const photoWait = 'div[role="button"][tabindex="0"]'; // first photo card
    const HIDE      = ['[class*="spinner"]', '[class*="loading"]'];

    // ── 1. Photos tab — desktop ───────────────────────────────────────────────
    const desktopPage = await newPage(browser, "desktop");
    await loginAs(desktopPage);
    await desktopPage.goto(eventUrl);
    await desktopPage.waitForSelector(photoWait, { timeout: 10_000 });
    await takeScreenshot(desktopPage, "event-photos-tab-desktop", {
      fullPage:      true,
      waitFor:       400,
      hideSelectors: HIDE,
    });
    await desktopPage.close();

    // ── 2. Photos tab — mobile ────────────────────────────────────────────────
    const mobilePage = await newPage(browser, "mobile");
    await loginAs(mobilePage);
    await mobilePage.goto(eventUrl);
    await mobilePage.waitForSelector(photoWait, { timeout: 10_000 });
    await takeScreenshot(mobilePage, "event-photos-tab-mobile", {
      fullPage:      true,
      waitFor:       400,
      hideSelectors: HIDE,
    });
    await mobilePage.close();

    // ── 3. Group filter + density (single page session) ───────────────────────
    const filterPage = await newPage(browser, "desktop");
    await loginAs(filterPage);
    await filterPage.goto(eventUrl);
    await filterPage.waitForSelector(photoWait, { timeout: 10_000 });

    // Click "Ceremony" group filter pill
    const clickedCeremony = await filterPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim().startsWith("Ceremony")
      );
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clickedCeremony) {
      await takeScreenshot(filterPage, "event-photos-group-filter", {
        waitFor:       500,
        hideSelectors: HIDE,
      });
    } else {
      console.warn("⚠️  Ceremony group pill not found — skipping event-photos-group-filter");
    }

    // Click "Comfortable" density button
    await filterPage.click('button[aria-label="Comfortable"]');
    await takeScreenshot(filterPage, "event-photos-density-comfortable", {
      waitFor:       300,
      hideSelectors: HIDE,
    });

    // Click "Dense" density button
    await filterPage.click('button[aria-label="Dense"]');
    await takeScreenshot(filterPage, "event-photos-density-dense", {
      waitFor:       300,
      hideSelectors: HIDE,
    });

    await filterPage.close();

    // ── 4. Upload zone ────────────────────────────────────────────────────────
    const uploadPage = await newPage(browser, "desktop");
    await loginAs(uploadPage);
    await uploadPage.goto(eventUrl);
    await uploadPage.waitForSelector(photoWait, { timeout: 10_000 });
    const clickedUpload = await clickButtonByText(uploadPage, "Upload Photos");
    if (clickedUpload) {
      // Wait for upload modal portal to mount
      await uploadPage.waitForSelector("div.fixed.inset-0", { timeout: 5_000 });
      await takeScreenshot(uploadPage, "event-upload-zone", {
        waitFor:       400,
        hideSelectors: HIDE,
      });
    } else {
      console.warn("⚠️  Upload Photos button not found — skipping event-upload-zone");
    }
    await uploadPage.close();

    // ── 5. People tab ─────────────────────────────────────────────────────────
    const peoplePage = await newPage(browser, "desktop");
    await loginAs(peoplePage);
    await peoplePage.goto(`${eventUrl}?tab=people`);
    await peoplePage.waitForSelector("main", { timeout: 8_000 });
    await takeScreenshot(peoplePage, "event-people-tab", {
      waitFor:       1000,
      fullPage:      true,
      hideSelectors: HIDE,
    });

    // If face detection is disabled, also screenshot the empty/disabled state
    const isDisabled = await peoplePage.evaluate(() =>
      !!document.querySelector('button')?.closest("div[class*='border-dashed']") ||
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent?.includes("Enable Face Detection")
      )
    );
    if (isDisabled) {
      await takeScreenshot(peoplePage, "event-people-empty-state", {
        hideSelectors: HIDE,
      });
    }
    await peoplePage.close();

    // ── 6. Selections tab ─────────────────────────────────────────────────────
    const selectionsPage = await newPage(browser, "desktop");
    await loginAs(selectionsPage);
    await selectionsPage.goto(`${eventUrl}/selections`);
    await selectionsPage.waitForSelector("main", { timeout: 8_000 });
    await takeScreenshot(selectionsPage, "event-selections-tab", {
      fullPage:      true,
      waitFor:       500,
      hideSelectors: HIDE,
    });
    await selectionsPage.close();

    // ── 7. Share link panel ───────────────────────────────────────────────────
    const sharePage = await newPage(browser, "desktop");
    await loginAs(sharePage);
    await sharePage.goto(eventUrl);
    await sharePage.waitForSelector(photoWait, { timeout: 10_000 });

    const clickedShare = await clickButtonByText(sharePage, "Share Event");
    if (clickedShare) {
      // Wait for the share modal portal (has overflow-y-auto unlike upload modal)
      await sharePage.waitForFunction(
        () =>
          !!document.querySelector("h2")
            && Array.from(document.querySelectorAll("h2")).some(
              (h) => h.textContent?.includes("Share Event")
            ),
        { timeout: 5_000 }
      );
      await takeScreenshot(sharePage, "event-share-link-panel", {
        waitFor:       300,
        hideSelectors: HIDE,
      });

      // Click the PIN access type tab
      const clickedPin = await sharePage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.trim() === "PIN"
        );
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clickedPin) {
        await takeScreenshot(sharePage, "event-share-pin-option", {
          waitFor:       300,
          hideSelectors: HIDE,
        });
      } else {
        console.warn("⚠️  PIN button not found in share modal — skipping event-share-pin-option");
      }
    } else {
      console.warn("⚠️  Share Event button not found — skipping share screenshots");
    }
    await sharePage.close();

    // ── 8. Lightbox ───────────────────────────────────────────────────────────
    const lightboxPage = await newPage(browser, "desktop");
    await loginAs(lightboxPage);
    await lightboxPage.goto(eventUrl);
    await lightboxPage.waitForSelector(photoWait, { timeout: 10_000 });

    // Scroll to top so first photo is in viewport, then click it
    await lightboxPage.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 300));
    // Use evaluate click to bypass Puppeteer's clickability check
    await lightboxPage.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.click();
    }, photoWait);
    // Lightbox renders at z-70 (bg-black fixed overlay)
    await lightboxPage.waitForFunction(
      () => !!document.querySelector('[class*="z-70"]') ||
            document.body.style.overflow === 'hidden',
      { timeout: 5_000 }
    );
    await takeScreenshot(lightboxPage, "event-lightbox-closed-info", {
      waitFor:       500,
      hideSelectors: HIDE,
    });

    // Click the info toggle button using evaluate to bypass clickability checks
    await lightboxPage.evaluate(() => {
      const btn =
        document.querySelector<HTMLElement>('button[aria-label="Show details"]') ||
        Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent?.includes("Show details")
        ) as HTMLElement | undefined;
      if (btn) btn.click();
    });
    await takeScreenshot(lightboxPage, "event-lightbox-open-info", {
      waitFor:       300,
      hideSelectors: HIDE,
    });
    await lightboxPage.close();

    // ── 9. Group manager ──────────────────────────────────────────────────────
    // GroupManager component is defined but not yet mounted in the event page.
    // Attempt gracefully; log a warning if the button isn't found.
    const gmPage = await newPage(browser, "desktop");
    await loginAs(gmPage);
    await gmPage.goto(eventUrl);
    await gmPage.waitForSelector(photoWait, { timeout: 10_000 });

    const clickedManage = await clickButtonByText(gmPage, "Manage Groups");
    if (clickedManage) {
      await takeScreenshot(gmPage, "event-group-manager", {
        waitFor:       400,
        hideSelectors: HIDE,
      });
    } else {
      console.warn(
        "⚠️  'Manage Groups' button not found — GroupManager not yet mounted in event page. Skipping event-group-manager."
      );
    }
    await gmPage.close();

    console.log("✅ Event screenshots complete");
  } finally {
    await browser.close();
  }
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureEvents().catch(console.error);
}
