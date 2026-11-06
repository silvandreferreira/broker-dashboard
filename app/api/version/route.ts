import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Versão (build) atualmente em produção. Pública: não expõe dados. */
export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
