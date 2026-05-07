export const SCREENSHOT_CONFIG = {
  baseUrl:   process.env.DOCS_BASE_URL || "http://localhost:3000",
  outputDir: "./docs/screenshots",
  testEmail:    "docs@photohouse.test",
  testPassword: "DocsTest@123",
  adminEmail:    "admin@photohouse.test",
  adminPassword: "AdminDocs@123",

  viewports: {
    desktop: { width: 1440, height: 900  },
    tablet:  { width: 768,  height: 1024 },
    mobile:  { width: 390,  height: 844  },
  },

  defaultViewport: "desktop" as const,

  screenshotOptions: {
    type:     "png" as const,
    fullPage: false,
  },
};
