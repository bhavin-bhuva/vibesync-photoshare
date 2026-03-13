import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { render } from "@react-email/components";
import { NewSelectionEmail, type NewSelectionEmailProps } from "@/emails/NewSelectionEmail";
import { getSesConfig } from "@/lib/platform-settings";

/**
 * Sends the "new photo selection" notification to the photographer.
 * Credentials are resolved from DB settings first, then env var fallback.
 * Errors are caught and logged rather than thrown so a send failure never
 * blocks the API response that already committed the selection to the DB.
 */
export async function sendNewSelectionEmail(
  toEmail: string,
  senderName: string | null,
  props: NewSelectionEmailProps
): Promise<void> {
  const config = await getSesConfig();

  if (!config.fromEmail) {
    console.warn("[ses] No from email configured — skipping notification email.");
    return;
  }
  if (!config.accessKeyId || !config.secretAccessKey) {
    console.warn("[ses] AWS credentials not configured — skipping notification email.");
    return;
  }

  const ses = new SESClient({
    region: config.region,
    credentials: {
      accessKeyId:     config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const fromAddress = senderName
    ? `"${senderName.replace(/"/g, "")}" <${config.fromEmail}>`
    : config.fromEmail;

  const subject = `New photo selection from ${props.customerName} — ${props.eventTitle}`;
  const html = await render(NewSelectionEmail(props));
  const text = await render(NewSelectionEmail(props), { plainText: true });

  try {
    await ses.send(
      new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
      })
    );
  } catch (err) {
    console.error("[ses] Failed to send new-selection email:", err);
  }
}
