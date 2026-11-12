import { NextRequest, NextResponse } from "next/server";
import { refreshFundamentals } from "@/lib/stockData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/stocks-refresh — atualiza um lote de fundamentais do S&P 500 (Finnhub).
 * Chamado por 3 Vercel Cron Jobs por dia (ver vercel.json); cada lote cobre ~200 ações.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const result = await refreshFundamentals(started + 270_000);
  return NextResponse.json({ ...result, seconds: Math.round((Date.now() - started) / 1000) });
}
