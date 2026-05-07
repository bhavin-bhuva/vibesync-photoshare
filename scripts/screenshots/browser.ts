import puppeteer, { type Browser, type Page } from "puppeteer";
import { SCREENSHOT_CONFIG } from "./config";
import fs from "fs";
import path from "path";

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
}

export async function newPage(
  browser: Browser,
  viewport: "desktop" | "tablet" | "mobile" = "desktop"
): Promise<Page> {
  const page = await browser.newPage();
  const vp   = SCREENSHOT_CONFIG.viewports[viewport];
  await page.setViewport(vp);
  return page;
}

export async function loginAs(
  page: Page,
  email    = SCREENSHOT_CONFIG.testEmail,
  password = SCREENSHOT_CONFIG.testPassword
): Promise<void> {
  await page.goto(`${SCREENSHOT_CONFIG.baseUrl}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  console.log("✅ Logged in as", email);
}

export async function takeScreenshot(
  page: Page,
  filename: string,
  options?: {
    selector?:      string;   // crop to specific element
    fullPage?:      boolean;  // capture full scrollable page
    waitFor?:       number;   // ms to wait before capturing
    hideSelectors?: string[]; // hide elements before capture
  }
): Promise<void> {
  fs.mkdirSync(SCREENSHOT_CONFIG.outputDir, { recursive: true });

  if (options?.waitFor) {
    await new Promise((r) => setTimeout(r, options.waitFor));
  }

  if (options?.hideSelectors?.length) {
    await page.evaluate((selectors: string[]) => {
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.visibility = "hidden";
        });
      });
    }, options.hideSelectors);
  }

  const outputPath = path.join(SCREENSHOT_CONFIG.outputDir, filename + ".png");

  if (options?.selector) {
    const element = await page.$(options.selector);
    if (element) {
      await element.screenshot({ path: outputPath });
      console.log("📸 Screenshot:", filename, "(element)");
      return;
    }
    console.warn(`⚠️  Selector not found: ${options.selector} — falling back to full page`);
  }

  await page.screenshot({
    path:     outputPath,
    fullPage: options?.fullPage ?? false,
  });
  console.log("📸 Screenshot:", filename);
}
