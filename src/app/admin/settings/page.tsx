import { requireSuperAdmin } from "@/lib/admin";
import { getAllSettings, SETTING_KEYS } from "@/lib/platform-settings";
import {
  PlatformSettingsSection,
  PlanLimitsSection,
  EmailSettingsSection,
  FaceSettingsSection,
} from "./SettingsClient";

export default async function SettingsPage() {
  const session  = await requireSuperAdmin();
  // getAllSettings covers the new SES keys too since SETTING_KEYS now includes them
  const settings = await getAllSettings();

  // Parse storage GB from bytes string
  function bytesToGb(key: string): number {
    const bytes = parseFloat(settings[key as keyof typeof settings] ?? "0");
    return parseFloat((bytes / 1024 ** 3).toFixed(4));
  }

  return (
    <div className="space-y-6">

      <PlatformSettingsSection
        initial={{
          appName:         settings[SETTING_KEYS.APP_NAME],
          supportEmail:    settings[SETTING_KEYS.SUPPORT_EMAIL],
          maintenanceMode: settings[SETTING_KEYS.MAINTENANCE_MODE] === "true",
          signupsEnabled:  settings[SETTING_KEYS.SIGNUPS_ENABLED]  !== "false",
        }}
      />

      <PlanLimitsSection
        initial={{
          storageFreeGb:   bytesToGb(SETTING_KEYS.PLAN_STORAGE_FREE),
          storageProGb:    bytesToGb(SETTING_KEYS.PLAN_STORAGE_PRO),
          storageStudioGb: bytesToGb(SETTING_KEYS.PLAN_STORAGE_STUDIO),
          maxEventsFree:   parseInt(settings[SETTING_KEYS.MAX_EVENTS_FREE],  10),
          maxEventsPro:    parseInt(settings[SETTING_KEYS.MAX_EVENTS_PRO],   10),
        }}
      />

      <EmailSettingsSection
        adminEmail={session.user.email}
        initialSes={{
          fromEmail: settings[SETTING_KEYS.SES_FROM_EMAIL],
          awsRegion: settings[SETTING_KEYS.SES_AWS_REGION],
          awsKeyId:  settings[SETTING_KEYS.SES_AWS_KEY_ID],
          // Never send the secret to the client — just tell it whether one is stored
          hasSecret: settings[SETTING_KEYS.SES_AWS_SECRET].length > 0,
        }}
      />

      <FaceSettingsSection
        initial={{
          featureEnabled:      settings[SETTING_KEYS.FACE_FEATURE_ENABLED]      !== "false",
          defaultIndexing:     settings[SETTING_KEYS.FACE_DEFAULT_INDEXING]      === "true",
          similarityThreshold: parseFloat(settings[SETTING_KEYS.FACE_SIMILARITY_THRESHOLD]),
          maxPerEvent:         parseInt(settings[SETTING_KEYS.FACE_MAX_PER_EVENT], 10),
          indexingFree:        settings[SETTING_KEYS.FACE_INDEXING_FREE]         === "true",
          indexingPro:         settings[SETTING_KEYS.FACE_INDEXING_PRO]          !== "false",
          indexingStudio:      settings[SETTING_KEYS.FACE_INDEXING_STUDIO]       !== "false",
          searchFree:          settings[SETTING_KEYS.FACE_SEARCH_FREE]           === "true",
          searchPro:           settings[SETTING_KEYS.FACE_SEARCH_PRO]            !== "false",
          searchStudio:        settings[SETTING_KEYS.FACE_SEARCH_STUDIO]         !== "false",
          maxSearchesFree:     parseInt(settings[SETTING_KEYS.FACE_MAX_SEARCHES_FREE],   10),
          maxSearchesPro:      parseInt(settings[SETTING_KEYS.FACE_MAX_SEARCHES_PRO],    10),
          maxSearchesStudio:   parseInt(settings[SETTING_KEYS.FACE_MAX_SEARCHES_STUDIO], 10),
        }}
      />

    </div>
  );
}
