import { launchBrowser, newPage, loginAs, takeScreenshot } from "./browser";
import { SCREENSHOT_CONFIG } from "./config";
import type { Page } from "puppeteer";

const BASE = SCREENSHOT_CONFIG.baseUrl;
const HIDE = ['[class*="spinner"]', '[class*="loading"]'];

// ─── Helper: login as the docs admin ─────────────────────────────────────────

async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, SCREENSHOT_CONFIG.adminEmail, SCREENSHOT_CONFIG.adminPassword);
}

// ─── Helper: scroll to first h2 containing text ───────────────────────────────

async function scrollToSection(page: Page, heading: string): Promise<void> {
  await page.evaluate((text: string) => {
    for (const h2 of document.querySelectorAll("h2")) {
      if (h2.textContent?.includes(text)) {
        h2.scrollIntoView({ behavior: "instant", block: "start" });
        return;
      }
    }
  }, heading);
  await new Promise((r) => setTimeout(r, 400));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function captureSettings() {
  const browser = await launchBrowser();

  try {
    // ════════════════════════════════════════════════════════════════
    // PART A — Photographer settings
    // ════════════════════════════════════════════════════════════════

    // ── 1. Profile — personal info ────────────────────────────────────────────
    const profilePage = await newPage(browser, "desktop");
    await loginAs(profilePage);
    await profilePage.goto(`${BASE}/dashboard/profile`);
    await profilePage.waitForSelector("section", { timeout: 8_000 });
    // Scroll to top to ensure personal info section is visible
    await profilePage.evaluate(() => window.scrollTo(0, 0));
    await takeScreenshot(profilePage, "settings-profile-personal", {
      waitFor:       300,
      hideSelectors: HIDE,
    });

    // ── 2. Profile — studio branding ──────────────────────────────────────────
    await scrollToSection(profilePage, "Studio Branding");
    await takeScreenshot(profilePage, "settings-profile-studio", {
      hideSelectors: HIDE,
    });

    // ── 3. Profile — watermark settings ──────────────────────────────────────
    await scrollToSection(profilePage, "Watermark Settings");
    await takeScreenshot(profilePage, "settings-watermark", {
      hideSelectors: HIDE,
    });
    await profilePage.close();

    // ── 4. Billing — current plan ─────────────────────────────────────────────
    const billingPage = await newPage(browser, "desktop");
    await loginAs(billingPage);
    await billingPage.goto(`${BASE}/dashboard/billing`);
    await billingPage.waitForSelector("main", { timeout: 8_000 });
    await billingPage.evaluate(() => window.scrollTo(0, 0));
    await takeScreenshot(billingPage, "settings-billing-plan", {
      waitFor:       400,
      hideSelectors: HIDE,
    });

    // ── 5. Billing — invoice history ──────────────────────────────────────────
    // Invoice History section renders only when Stripe returns invoices.
    // Scroll to it if present; otherwise scroll to page bottom.
    const hasInvoices = await billingPage.evaluate(() =>
      Array.from(document.querySelectorAll("h2")).some(
        (h) => h.textContent?.includes("Invoice History")
      )
    );
    if (hasInvoices) {
      await scrollToSection(billingPage, "Invoice History");
    } else {
      await billingPage.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await new Promise((r) => setTimeout(r, 300));
      console.warn(
        "⚠️  No Stripe invoices in dev — scrolled to page bottom for settings-billing-invoices"
      );
    }
    await takeScreenshot(billingPage, "settings-billing-invoices", {
      fullPage:      false,
      hideSelectors: HIDE,
    });
    await billingPage.close();

    // ════════════════════════════════════════════════════════════════
    // PART B — Admin panel
    // ════════════════════════════════════════════════════════════════

    // ── 6. Admin dashboard overview ───────────────────────────────────────────
    const adminHome = await newPage(browser, "desktop");
    await loginAsAdmin(adminHome);
    await adminHome.goto(`${BASE}/admin`);
    await adminHome.waitForSelector("main, h1, h2", { timeout: 8_000 });
    await takeScreenshot(adminHome, "admin-dashboard-overview", {
      fullPage:      true,
      waitFor:       500,
      hideSelectors: HIDE,
    });
    await adminHome.close();

    // ── 7. Admin photographers list ───────────────────────────────────────────
    const photogsPage = await newPage(browser, "desktop");
    await loginAsAdmin(photogsPage);
    await photogsPage.goto(`${BASE}/admin/photographers`, { waitUntil: "load" });
    // Wait for main content — table may be hidden on mobile but visible at 1440px
    await photogsPage.waitForSelector("main", { timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 800)); // allow React hydration
    await takeScreenshot(photogsPage, "admin-photographers-list", {
      fullPage:      true,
      waitFor:       400,
      hideSelectors: HIDE,
    });

    // ── 8. Admin photographer detail ──────────────────────────────────────────
    // Click first tbody row to navigate to photographer detail
    const clickedRow = await photogsPage.evaluate(() => {
      const row = document.querySelector("tbody tr") as HTMLElement | null;
      if (row) { row.click(); return true; }
      return false;
    });
    if (clickedRow) {
      await photogsPage.waitForNavigation({
        waitUntil: "load",
        timeout:   15_000,
      });
      await takeScreenshot(photogsPage, "admin-photographer-detail", {
        fullPage:      true,
        waitFor:       400,
        hideSelectors: HIDE,
      });
    } else {
      console.warn("⚠️  No photographer rows found — skipping admin-photographer-detail");
    }
    await photogsPage.close();

    // ── 9. Admin storage page ─────────────────────────────────────────────────
    const storagePage = await newPage(browser, "desktop");
    await loginAsAdmin(storagePage);
    await storagePage.goto(`${BASE}/admin/storage`);
    await storagePage.waitForSelector("main, table, h1, h2", { timeout: 8_000 });
    await takeScreenshot(storagePage, "admin-storage-page", {
      fullPage:      true,
      waitFor:       500,
      hideSelectors: HIDE,
    });
    await storagePage.close();

    // ── 10. Admin plans page ──────────────────────────────────────────────────
    const plansPage = await newPage(browser, "desktop");
    await loginAsAdmin(plansPage);
    await plansPage.goto(`${BASE}/admin/plans`);
    await plansPage.waitForSelector("main, h1, h2", { timeout: 8_000 });
    await takeScreenshot(plansPage, "admin-plans-management", {
      fullPage:      true,
      waitFor:       500,
      hideSelectors: HIDE,
    });
    await plansPage.close();

    // ── 11. Admin activity log ────────────────────────────────────────────────
    const activityPage = await newPage(browser, "desktop");
    await loginAsAdmin(activityPage);
    await activityPage.goto(`${BASE}/admin/activity`);
    await activityPage.waitForSelector("main, table, [class*='divide-y'], h1", {
      timeout: 8_000,
    });
    await takeScreenshot(activityPage, "admin-activity-log", {
      fullPage:      true,
      waitFor:       400,
      hideSelectors: HIDE,
    });
    await activityPage.close();

    console.log("✅ Settings & admin screenshots complete");
  } finally {
    await browser.close();
  }
}

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureSettings().catch(console.error);
}
