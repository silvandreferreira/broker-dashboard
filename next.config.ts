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
  async headers() {
    return [
      {
        // O browser tem de ir sempre buscar a versão mais recente do service worker
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
