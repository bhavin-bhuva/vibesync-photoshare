import { launchBrowser, newPage, takeScreenshot } from "./browser";
import { SCREENSHOT_CONFIG } from "./config";

async function captureAuth() {
  const browser = await launchBrowser();

  try {
    // ── LOGIN PAGE ──
    const loginPage = await newPage(browser, "desktop");
    await loginPage.goto(`${SCREENSHOT_CONFIG.baseUrl}/login`);
    await loginPage.waitForSelector('input[type="email"]');
    await takeScreenshot(loginPage, "auth-login-desktop");
    await loginPage.close();

    // Login page mobile
    const loginMobile = await newPage(browser, "mobile");
    await loginMobile.goto(`${SCREENSHOT_CONFIG.baseUrl}/login`);
    await loginMobile.waitForSelector('input[type="email"]');
    await takeScreenshot(loginMobile, "auth-login-mobile");
    await loginMobile.close();

    // ── REGISTER PAGE ──
    const registerPage = await newPage(browser, "desktop");
    await registerPage.goto(`${SCREENSHOT_CONFIG.baseUrl}/register`);
    await registerPage.waitForSelector('input[name="name"]');
    await takeScreenshot(registerPage, "auth-register-desktop");
    await registerPage.close();

    // ── PRICING PAGE ──
    const pricingPage = await newPage(browser, "desktop");
    await pricingPage.goto(`${SCREENSHOT_CONFIG.baseUrl}/pricing`);
    await pricingPage.waitForSelector('.pricing-grid, [class*="pricing"]');
    await takeScreenshot(pricingPage, "pricing-plans-desktop", {
      fullPage: true,
    });
    await pricingPage.close();

    console.log("✅ Auth screenshots complete");
  } finally {
    await browser.close();
  }
}

captureAuth().catch(console.error);
