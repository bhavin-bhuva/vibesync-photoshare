import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin";
import { WebhookClient, type WebhookConfigRow } from "./WebhookClient";
import type { WebhookLogRow } from "./actions";

export default async function WebhookPage() {
  await requireSuperAdmin();

  const [config, rawLogs] = await Promise.all([
    db.stripeWebhookConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.webhookLog.findMany({
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
  ]);

  const configRow: WebhookConfigRow | null = config
    ? {
        id: config.id,
        endpointUrl: config.endpointUrl,
        hasSecret: !!config.webhookSecret,
        isActive: config.isActive,
        lastVerifiedAt: config.lastVerifiedAt?.toISOString() ?? null,
      }
    : null;

  const logs: WebhookLogRow[] = rawLogs.map((l) => ({
    id: l.id,
    eventType: l.eventType,
    stripeEventId: l.stripeEventId,
    status: l.status,
    errorMessage: l.errorMessage,
    processingMs: l.processingMs,
    receivedAt: l.receivedAt.toISOString(),
  }));

  return <WebhookClient config={configRow} logs={logs} />;
}
