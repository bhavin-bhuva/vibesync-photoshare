import { db } from "@/lib/db";

// ─── Setting keys ─────────────────────────────────────────────────────────────

export const SETTING_KEYS = {
  APP_NAME:             "app_name",
  SUPPORT_EMAIL:        "support_email",
  MAINTENANCE_MODE:     "maintenance_mode",
  SIGNUPS_ENABLED:      "signups_enabled",
  PLAN_STORAGE_FREE:    "plan_storage_free_bytes",
  PLAN_STORAGE_PRO:     "plan_storage_pro_bytes",
  PLAN_STORAGE_STUDIO:  "plan_storage_studio_bytes",
  MAX_EVENTS_FREE:      "max_events_free",
  MAX_EVENTS_PRO:       "max_events_pro",
  // SES / email configuration
  SES_FROM_EMAIL:       "ses_from_email",
  SES_AWS_REGION:       "ses_aws_region",
  SES_AWS_KEY_ID:       "ses_aws_access_key_id",
  SES_AWS_SECRET:       "ses_aws_secret_access_key",
  // Face AI feature controls
  FACE_FEATURE_ENABLED:       "face_feature_enabled",
  FACE_DEFAULT_INDEXING:      "face_default_indexing",
  FACE_SIMILARITY_THRESHOLD:  "face_similarity_threshold",
  FACE_MAX_PER_EVENT:         "face_max_per_event",
  // Face AI plan controls — which plans can index / search
  FACE_INDEXING_FREE:         "face_indexing_free",
  FACE_INDEXING_PRO:          "face_indexing_pro",
  FACE_INDEXING_STUDIO:       "face_indexing_studio",
  FACE_SEARCH_FREE:           "face_search_free",
  FACE_SEARCH_PRO:            "face_search_pro",
  FACE_SEARCH_STUDIO:         "face_search_studio",
  // Face AI monthly search limits per plan (0 = unlimited)
  FACE_MAX_SEARCHES_FREE:     "face_max_searches_free",
  FACE_MAX_SEARCHES_PRO:      "face_max_searches_pro",
  FACE_MAX_SEARCHES_STUDIO:   "face_max_searches_studio",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// Defaults returned when no DB row exists yet
export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  app_name:                   "PhotoShare",
  support_email:               "",
  maintenance_mode:            "false",
  signups_enabled:             "true",
  plan_storage_free_bytes:     String(1  * 1024 ** 3),  // 1 GB
  plan_storage_pro_bytes:      String(50 * 1024 ** 3),  // 50 GB
  plan_storage_studio_bytes:   String(500 * 1024 ** 3), // 500 GB
  max_events_free:             "3",
  max_events_pro:              "25",
  // SES — fall back to env vars when empty
  ses_from_email:              "",
  ses_aws_region:              "",
  ses_aws_access_key_id:       "",
  ses_aws_secret_access_key:   "",
  // Face AI defaults
  face_feature_enabled:        "true",
  face_default_indexing:       "false",
  face_similarity_threshold:   "0.6",
  face_max_per_event:          "10000",
  face_indexing_free:          "false",
  face_indexing_pro:           "true",
  face_indexing_studio:        "true",
  face_search_free:            "false",
  face_search_pro:             "true",
  face_search_studio:          "true",
  face_max_searches_free:      "0",
  face_max_searches_pro:       "500",
  face_max_searches_studio:    "0",
};

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await db.platformSettings.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getSettings(
  keys: SettingKey[]
): Promise<Record<SettingKey, string>> {
  const rows = await db.platformSettings.findMany({
    where: { key: { in: keys } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<SettingKey, string>>;
  const result = {} as Record<SettingKey, string>;
  for (const k of keys) {
    result[k] = map[k] ?? SETTING_DEFAULTS[k];
  }
  return result;
}

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  return getSettings(Object.values(SETTING_KEYS));
}

// ─── Setters ──────────────────────────────────────────────────────────────────

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db.platformSettings.upsert({
    where:  { key },
    update: { value },
    create: { key, value },
  });
}

export async function setSettings(updates: Partial<Record<SettingKey, string>>): Promise<void> {
  await Promise.all(
    Object.entries(updates).map(([k, v]) => setSetting(k as SettingKey, v!))
  );
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export async function isMaintenanceMode(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.MAINTENANCE_MODE)) === "true";
}

export async function isSignupsEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.SIGNUPS_ENABLED)) !== "false";
}

export async function getPlanStorageLimits(): Promise<Record<"FREE" | "PRO" | "STUDIO", bigint>> {
  const settings = await getSettings([
    SETTING_KEYS.PLAN_STORAGE_FREE,
    SETTING_KEYS.PLAN_STORAGE_PRO,
    SETTING_KEYS.PLAN_STORAGE_STUDIO,
  ]);
  return {
    FREE:   BigInt(settings[SETTING_KEYS.PLAN_STORAGE_FREE]),
    PRO:    BigInt(settings[SETTING_KEYS.PLAN_STORAGE_PRO]),
    STUDIO: BigInt(settings[SETTING_KEYS.PLAN_STORAGE_STUDIO]),
  };
}

export async function getEventLimits(): Promise<Record<"FREE" | "PRO", number>> {
  const settings = await getSettings([SETTING_KEYS.MAX_EVENTS_FREE, SETTING_KEYS.MAX_EVENTS_PRO]);
  return {
    FREE: parseInt(settings[SETTING_KEYS.MAX_EVENTS_FREE], 10),
    PRO:  parseInt(settings[SETTING_KEYS.MAX_EVENTS_PRO], 10),
  };
}

// ─── SES config: DB values take priority, env vars are fallback ───────────────

export type SesConfig = {
  region:          string;
  accessKeyId:     string;
  secretAccessKey: string;
  fromEmail:       string;
};

export async function getSesConfig(): Promise<SesConfig> {
  const s = await getSettings([
    SETTING_KEYS.SES_FROM_EMAIL,
    SETTING_KEYS.SES_AWS_REGION,
    SETTING_KEYS.SES_AWS_KEY_ID,
    SETTING_KEYS.SES_AWS_SECRET,
  ]);
  return {
    region:          s[SETTING_KEYS.SES_AWS_REGION]  || process.env.AWS_REGION          || "",
    accessKeyId:     s[SETTING_KEYS.SES_AWS_KEY_ID]  || process.env.AWS_ACCESS_KEY_ID   || "",
    secretAccessKey: s[SETTING_KEYS.SES_AWS_SECRET]  || process.env.AWS_SECRET_ACCESS_KEY || "",
    fromEmail:       s[SETTING_KEYS.SES_FROM_EMAIL]  || process.env.SES_FROM_EMAIL       || "",
  };
}
