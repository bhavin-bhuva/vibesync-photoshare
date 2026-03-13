"use server";

import { SESClient, SendEmailCommand, GetSendQuotaCommand } from "@aws-sdk/client-ses";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import {
  setSettings,
  setSetting,
  getSesConfig,
  SETTING_KEYS,
  type SettingKey,
} from "@/lib/platform-settings";

// ─── Shared: build SES client from DB config ──────────────────────────────────

async function buildSesClient() {
  const config = await getSesConfig();
  if (!config.accessKeyId || !config.secretAccessKey || !config.region) {
    throw new Error("SES credentials are not fully configured.");
  }
  return {
    client: new SESClient({
      region:      config.region,
      credentials: {
        accessKeyId:     config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    fromEmail: config.fromEmail,
  };
}

// ─── Save platform settings (app_name, support_email, toggles) ────────────────

export async function savePlatformSettingsAction(updates: {
  appName:         string;
  supportEmail:    string;
  maintenanceMode: boolean;
  signupsEnabled:  boolean;
}): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin();
    await setSettings({
      [SETTING_KEYS.APP_NAME]:         updates.appName.trim() || "PhotoShare",
      [SETTING_KEYS.SUPPORT_EMAIL]:    updates.supportEmail.trim(),
      [SETTING_KEYS.MAINTENANCE_MODE]: updates.maintenanceMode ? "true" : "false",
      [SETTING_KEYS.SIGNUPS_ENABLED]:  updates.signupsEnabled  ? "true" : "false",
    } as Partial<Record<SettingKey, string>>);
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to save settings." };
  }
}

// ─── Save plan limits ─────────────────────────────────────────────────────────

export async function savePlanLimitsAction(updates: {
  storageFreeGb:   number;
  storageProGb:    number;
  storageStudioGb: number;
  maxEventsFree:   number;
  maxEventsPro:    number;
}): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin();

    if (
      updates.storageFreeGb   <= 0 ||
      updates.storageProGb    <= 0 ||
      updates.storageStudioGb <= 0 ||
      updates.maxEventsFree   <= 0 ||
      updates.maxEventsPro    <= 0
    ) {
      return { error: "All limits must be greater than 0." };
    }

    const freeBytes   = BigInt(Math.round(updates.storageFreeGb   * 1024 ** 3));
    const proBytes    = BigInt(Math.round(updates.storageProGb    * 1024 ** 3));
    const studioBytes = BigInt(Math.round(updates.storageStudioGb * 1024 ** 3));

    // 1. Save to PlatformSettings
    await setSettings({
      [SETTING_KEYS.PLAN_STORAGE_FREE]:   freeBytes.toString(),
      [SETTING_KEYS.PLAN_STORAGE_PRO]:    proBytes.toString(),
      [SETTING_KEYS.PLAN_STORAGE_STUDIO]: studioBytes.toString(),
      [SETTING_KEYS.MAX_EVENTS_FREE]:     String(updates.maxEventsFree),
      [SETTING_KEYS.MAX_EVENTS_PRO]:      String(updates.maxEventsPro),
    } as Partial<Record<SettingKey, string>>);

    // 2. Bulk-update existing users' storageLimit based on their current plan tier
    await Promise.all([
      db.user.updateMany({
        where: { subscription: { planTier: "FREE" } },
        data:  { storageLimit: freeBytes },
      }),
      db.user.updateMany({
        where: { subscription: { planTier: "PRO" } },
        data:  { storageLimit: proBytes },
      }),
      db.user.updateMany({
        where: { subscription: { planTier: "STUDIO" } },
        data:  { storageLimit: studioBytes },
      }),
    ]);

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to save plan limits." };
  }
}

// ─── Send test email ──────────────────────────────────────────────────────────

export async function sendTestEmailAction(): Promise<{ error?: string }> {
  try {
    const session = await requireSuperAdmin();
    const toEmail = session.user.email;

    const { client: ses, fromEmail } = await buildSesClient();
    if (!fromEmail) return { error: "From email address is not configured. Set it in Email Settings." };

    await ses.send(
      new SendEmailCommand({
        Source:      fromEmail,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: "PhotoShare — Test Email", Charset: "UTF-8" },
          Body: {
            Text: {
              Data: `This is a test email from PhotoShare admin panel.\n\nSent to: ${toEmail}\nSent from: ${fromEmail}\nTimestamp: ${new Date().toISOString()}`,
              Charset: "UTF-8",
            },
            Html: {
              Data: `
                <div style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:32px;border:1px solid #e4e4e7;border-radius:12px">
                  <h2 style="margin:0 0 8px;font-size:18px;color:#18181b">✓ Test Email</h2>
                  <p style="margin:0 0 16px;color:#71717a;font-size:14px">This is a test email from the PhotoShare admin panel.</p>
                  <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <tr><td style="padding:6px 0;color:#a1a1aa">To</td><td style="padding:6px 0;color:#18181b">${toEmail}</td></tr>
                    <tr><td style="padding:6px 0;color:#a1a1aa">From</td><td style="padding:6px 0;color:#18181b">${fromEmail}</td></tr>
                    <tr><td style="padding:6px 0;color:#a1a1aa">Sent</td><td style="padding:6px 0;color:#18181b">${new Date().toUTCString()}</td></tr>
                  </table>
                  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">SES is configured correctly.</p>
                </div>
              `,
              Charset: "UTF-8",
            },
          },
        },
      })
    );

    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: `Failed to send test email: ${msg || "Unknown SES error"}` };
  }
}

// ─── Get SES sending quota ────────────────────────────────────────────────────

export type SesQuota = {
  max24HourSend:     number;
  maxSendRate:       number;
  sentLast24Hours:   number;
  percentUsed:       number;
};

export async function getSesQuotaAction(): Promise<{ quota?: SesQuota; error?: string }> {
  try {
    await requireSuperAdmin();
    const { client: ses } = await buildSesClient();
    const res = await ses.send(new GetSendQuotaCommand({}));

    const max24    = res.Max24HourSend   ?? 0;
    const sent     = res.SentLast24Hours ?? 0;
    const rate     = res.MaxSendRate     ?? 0;
    const pct      = max24 > 0 ? Math.round((sent / max24) * 100) : 0;

    return {
      quota: {
        max24HourSend:   max24,
        maxSendRate:     rate,
        sentLast24Hours: sent,
        percentUsed:     pct,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: `Could not fetch SES quota: ${msg || "Check AWS credentials"}` };
  }
}

// ─── Save SES configuration ───────────────────────────────────────────────────

// The secret key uses a sentinel value when the user hasn't changed it
const SECRET_UNCHANGED = "••••••••";

export async function saveSesConfigAction(updates: {
  fromEmail:       string;
  awsRegion:       string;
  awsKeyId:        string;
  awsSecret:       string; // may be SECRET_UNCHANGED if user didn't touch it
}): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin();

    const toSave: Partial<Record<SettingKey, string>> = {
      [SETTING_KEYS.SES_FROM_EMAIL]: updates.fromEmail.trim(),
      [SETTING_KEYS.SES_AWS_REGION]: updates.awsRegion.trim(),
      [SETTING_KEYS.SES_AWS_KEY_ID]: updates.awsKeyId.trim(),
    };

    // Only overwrite the secret if the user actually typed a new value
    if (updates.awsSecret && !updates.awsSecret.startsWith(SECRET_UNCHANGED.slice(0, 4))) {
      toSave[SETTING_KEYS.SES_AWS_SECRET] = updates.awsSecret.trim();
    }

    await setSettings(toSave);
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to save SES configuration." };
  }
}
