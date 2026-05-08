import { captureAuth }      from "./capture-auth";
import { captureDashboard } from "./capture-dashboard";
import { captureEvents }    from "./capture-events";
import { captureGallery }   from "./capture-gallery";
import { captureSettings }  from "./capture-settings";
import { fileURLToPath }    from "url";

const SECTIONS: Array<{ label: string; fn: () => Promise<void> }> = [
  { label: "Auth & pricing",   fn: captureAuth      },
  { label: "Dashboard",        fn: captureDashboard  },
  { label: "Event detail",     fn: captureEvents    },
  { label: "Public gallery",   fn: captureGallery   },
  { label: "Settings & admin", fn: captureSettings  },
];

async function captureAll() {
  console.log("🚀 Starting full screenshot capture...\n");

  const failed: string[] = [];

  for (const { label, fn } of SECTIONS) {
    console.log(`── ${label} ${"─".repeat(Math.max(0, 46 - label.length))}`);
    try {
      await fn();
    } catch (err) {
      console.error(`❌ ${label} failed:`, (err as Error).message);
      failed.push(label);
    }
    console.log();
  }

  if (failed.length === 0) {
    console.log("✅ All screenshots captured!");
  } else {
    console.log(`⚠️  Completed with ${failed.length} section failure(s): ${failed.join(", ")}`);
  }
  console.log("📁 Saved to: ./docs/screenshots/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureAll().catch(console.error);
}
