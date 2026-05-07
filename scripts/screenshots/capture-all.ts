import { captureAuth }      from "./capture-auth";
import { captureDashboard } from "./capture-dashboard";
import { captureEvents }    from "./capture-events";
import { captureGallery }   from "./capture-gallery";
import { captureSettings }  from "./capture-settings";
import { fileURLToPath }    from "url";

async function captureAll() {
  console.log("🚀 Starting full screenshot capture...\n");

  console.log("── Auth & pricing ──────────────────────────────");
  await captureAuth();

  console.log("\n── Dashboard ───────────────────────────────────");
  await captureDashboard();

  console.log("\n── Event detail ────────────────────────────────");
  await captureEvents();

  console.log("\n── Public gallery ──────────────────────────────");
  await captureGallery();

  console.log("\n── Settings & admin ────────────────────────────");
  await captureSettings();

  console.log("\n✅ All screenshots captured!");
  console.log("📁 Saved to: ./docs/screenshots/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureAll().catch(console.error);
}
