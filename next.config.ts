import type { NextConfig } from "next";

/**
 * Identificador da build, embutido no cliente e no servidor no momento do build.
 * O cliente compara-o com /api/version para avisar quando há uma versão nova.
 */
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  experimental: {
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
