import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getStockDetail, loadScores } from "@/lib/stockData";
import { SP500 } from "@/lib/sp500";

/** GET /api/stocks/NVDA — notas detalhadas, métricas, séries e dados de analistas/insiders. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  if (!SP500.some((c) => c.symbol === symbol)) {
    return NextResponse.json({ error: "Ação fora do S&P 500" }, { status: 404 });
  }
  const [{ scores }, row] = await Promise.all([
    loadScores(),
    prisma.stockFundamentals.findUnique({ where: { symbol } }),
  ]);
  const score = scores.find((s) => s.symbol === symbol) ?? null;
  if (!row?.metrics || !score) {
    return NextResponse.json({ error: "Ainda sem dados para esta ação" }, { status: 404 });
  }
  const { detail, fetchedAt } = await getStockDetail(symbol);
  return NextResponse.json({
    score,
    metrics: row.metrics,
    series: row.series,
    fundamentalsAt: row.fetchedAt.toISOString(),
    detail,
    detailAt: fetchedAt,
  });
}
