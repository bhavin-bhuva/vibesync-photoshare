-- Convert status from Int to String, mapping existing numeric codes to labels
ALTER TABLE "WebhookLog"
  ALTER COLUMN "status" TYPE TEXT
  USING CASE
    WHEN "status" = 200 THEN 'SUCCESS'
    ELSE 'FAILED'
  END;

-- Add index for deduplication lookups
CREATE INDEX "WebhookLog_stripeEventId_status_idx" ON "WebhookLog"("stripeEventId", "status");
