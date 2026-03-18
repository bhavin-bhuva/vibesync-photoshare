"use server";

import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { encrypt, decrypt } from "@/lib/encryption";

// ─── Save Config ──────────────────────────────────────────────────────────────

export async function saveWebhookConfigAction(
  endpointUrl: string,
  newSecret: string
): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin();
    if (!endpointUrl.trim()) return { error: "Endpoint URL is required." };
    if (!newSecret.trim()) return { error: "Webhook secret is required." };

    const encrypted = encrypt(newSecret.trim());
    await db.$transaction([
      db.stripeWebhookConfig.updateMany({ data: { isActive: false } }),
      db.stripeWebhookConfig.create({
        data: { webhookSecret: encrypted, endpointUrl: endpointUrl.trim(), isActive: true },
      }),
    ]);
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to save configuration." };
  }
}

// ─── Toggle Active ─────────────────────────────────────────────────────────────

export async function toggleWebhookActiveAction(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  try {
    await requireSuperAdmin();
    await db.stripeWebhookConfig.update({ where: { id }, data: { isActive } });
    return {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to update." };
  }
}

// ─── Test Webhook ──────────────────────────────────────────────────────────────

export type TestWebhookResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

export async function testWebhookAction(): Promise<TestWebhookResult> {
  try {
    await requireSuperAdmin();

    const config = await db.stripeWebhookConfig.findFirst({
      where: { isActive: true },
      select: { webhookSecret: true, endpointUrl: true },
    });
    if (!config) {
      return { ok: false, detail: "No active webhook configuration found." };
    }

    const secret = decrypt(config.webhookSecret);

    const timestamp = Math.floor(Date.now() / 1000);
    const testPayload = JSON.stringify({
      id: "evt_test_webhook_ping",
      object: "event",
      type: "test.webhook.ping",
      api_version: "2024-06-20",
      created: timestamp,
      data: { object: {} },
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    const signedPayload = `${timestamp}.${testPayload}`;
    const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
    const stripeSignature = `t=${timestamp},v1=${sig}`;

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripeSignature,
      },
      body: testPayload,
    });

    if (response.ok) {
      await db.stripeWebhookConfig.updateMany({
        where: { isActive: true },
        data: { lastVerifiedAt: new Date() },
      });
      return { ok: true, detail: "Webhook verified — signature check passed" };
    } else {
      const data = await response.json().catch(() => ({})) as { error?: string };
      return { ok: false, detail: `Signature check failed — ${data.error ?? "secret may be wrong"}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { ok: false, detail: "Access denied." };
    return { ok: false, detail: `Test failed: ${msg}` };
  }
}

// ─── Get Logs ─────────────────────────────────────────────────────────────────

export type WebhookLogRow = {
  id: string;
  eventType: string;
  stripeEventId: string;
  status: string; // "SUCCESS" | "FAILED"
  errorMessage: string | null;
  processingMs: number;
  receivedAt: string;
};

export async function getWebhookLogsAction(): Promise<
  { logs: WebhookLogRow[] } | { error: string }
> {
  try {
    await requireSuperAdmin();
    const logs = await db.webhookLog.findMany({
      orderBy: { receivedAt: "desc" },
      take: 20,
    });
    return {
      logs: logs.map((l) => ({
        id: l.id,
        eventType: l.eventType,
        stripeEventId: l.stripeEventId,
        status: l.status,
        errorMessage: l.errorMessage,
        processingMs: l.processingMs,
        receivedAt: l.receivedAt.toISOString(),
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") return { error: "Access denied." };
    return { error: "Failed to load logs." };
  }
}
