import { launchBrowser, newPage, loginAs, takeScreenshot } from "./browser";
import { SCREENSHOT_CONFIG } from "./config";

export async function captureDashboard() {
  const browser = await launchBrowser();

  try {
    // ── 1. Dashboard overview — desktop ──────────────────────────────────────
    const dashDesktop = await newPage(browser, "desktop");
    await loginAs(dashDesktop);
    await dashDesktop.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard`);
    // Wait for event cards to confirm content loaded
    await dashDesktop.waitForSelector('a[href^="/dashboard/events/"]', {
      timeout: 10_000,
    });
    await takeScreenshot(dashDesktop, "dashboard-overview-desktop", {
      fullPage: true,
    });

    // ── 2. Events grid (same page, above-fold crop) ───────────────────────────
    await takeScreenshot(dashDesktop, "dashboard-events-grid");
    await dashDesktop.close();

    // ── 3. Dashboard overview — mobile ───────────────────────────────────────
    const dashMobile = await newPage(browser, "mobile");
    await loginAs(dashMobile);
    await dashMobile.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard`);
    await dashMobile.waitForSelector('a[href^="/dashboard/events/"]', {
      timeout: 10_000,
    });
    await takeScreenshot(dashMobile, "dashboard-overview-mobile", {
      fullPage: true,
    });
    await dashMobile.close();

    // ── 4. New Event modal ────────────────────────────────────────────────────
    const modalPage = await newPage(browser, "desktop");
    await loginAs(modalPage);
    await modalPage.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard`);
    await modalPage.waitForSelector('a[href^="/dashboard/events/"]', {
      timeout: 10_000,
    });

    // Click the "+ New Event" button in the section header
    await modalPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("New Event")
      );
      btn?.click();
    });
    await modalPage.waitForSelector('[role="dialog"][aria-modal="true"]', {
      timeout: 5_000,
    });
    await takeScreenshot(modalPage, "dashboard-new-event-modal", {
      waitFor: 200, // let modal animation settle
    });
    await modalPage.close();

    // ── 5. Storage bar close-up ───────────────────────────────────────────────
    const storagePage = await newPage(browser, "desktop");
    await loginAs(storagePage);
    await storagePage.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard`);
    await storagePage.waitForSelector('a[href^="/dashboard/events/"]', {
      timeout: 10_000,
    });

    // Tag the storage stat card so we can select it
    await storagePage.evaluate(() => {
      const labels = document.querySelectorAll("p");
      for (const p of labels) {
        if (p.textContent?.trim() === "Storage") {
          const card = p.closest("div");
          if (card) card.setAttribute("data-ss", "storage-card");
          break;
        }
      }
    });
    await takeScreenshot(storagePage, "dashboard-storage-bar", {
      selector: '[data-ss="storage-card"]',
    });
    await storagePage.close();

    // ── 6. Billing page ───────────────────────────────────────────────────────
    const billingPage = await newPage(browser, "desktop");
    await loginAs(billingPage);
    await billingPage.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard/billing`);
    await billingPage.waitForSelector("main, [class*='billing'], h1, h2", {
      timeout: 8_000,
    });
    await takeScreenshot(billingPage, "dashboard-billing-page", {
      fullPage: true,
    });
    await billingPage.close();

    // ── 7. Profile page ───────────────────────────────────────────────────────
    const profilePage = await newPage(browser, "desktop");
    await loginAs(profilePage);
    await profilePage.goto(`${SCREENSHOT_CONFIG.baseUrl}/dashboard/profile`);
    await profilePage.waitForSelector("main, form, h1, h2", {
      timeout: 8_000,
    });
    await takeScreenshot(profilePage, "dashboard-profile-page", {
      fullPage: true,
    });

    // Scroll to studio branding section
    await profilePage.evaluate(() => {
      document
        .querySelector('[class*="studio"], #studio-branding')
        ?.scrollIntoView();
    });
    await new Promise((r) => setTimeout(r, 500));
    await takeScreenshot(profilePage, "dashboard-profile-studio-branding");
    await profilePage.close();

    console.log("✅ Dashboard screenshots complete");
  } finally {
    await browser.close();
  }
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureDashboard().catch(console.error);
}
