import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@automation-ai/shared"],
  // Standalone output bundles only what's needed to run in production (used by Docker)
  output: "standalone",
};

export default nextConfig;
