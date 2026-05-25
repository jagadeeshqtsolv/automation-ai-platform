import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@automation-ai/core"],
  // Standalone output bundles only what's needed to run in production (used by Docker)
  output: "standalone",
  // Pin the tracing root to this monorepo so Next.js ignores lockfiles outside it
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
