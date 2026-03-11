/**
 * Applies the required CORS policy to the S3 bucket so browsers can
 * PUT files directly via presigned URLs.
 *
 * Usage:
 *   npx tsx scripts/setup-s3-cors.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const bucket = process.env.AWS_S3_BUCKET_NAME;
const region = process.env.AWS_REGION;

if (!bucket || !region) {
  console.error("❌  AWS_S3_BUCKET_NAME and AWS_REGION must be set in .env.local");
  process.exit(1);
}

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const corsConfig = {
  CORSRules: [
    {
      // Allow direct browser uploads from any origin in dev; restrict in prod
      // by replacing "*" with your production domain.
      AllowedOrigins: ["http://localhost:3000", "http://localhost:3001", "*"],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
};

async function main() {
  console.log(`Applying CORS policy to bucket: ${bucket} (${region})`);

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfig,
    })
  );

  console.log("✅  CORS policy applied successfully.");

  // Verify
  const { CORSRules } = await s3.send(
    new GetBucketCorsCommand({ Bucket: bucket })
  );
  console.log("\nCurrent CORS rules:");
  console.log(JSON.stringify(CORSRules, null, 2));
}

main().catch((err) => {
  console.error("❌  Failed to apply CORS:", err.message);
  process.exit(1);
});
