import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "qrcode-generator"],
  experimental: {
    workerThreads: false,
    cpus: 1,
    // Enable Turbopack filesystem cache — may stabilise module initialisation
    // for /_global-error prerender (Next.js 16.1.6 bug, digest 3484053479).
    turbopackFileSystemCacheForBuild: true,
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
