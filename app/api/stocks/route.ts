import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { loadScores } from "@/lib/stockData";
import { SP500 } from "@/lib/sp500";

/** GET /api/stocks — radar: notas de Qualidade e Valuation de todo o S&P 500. */
export async function GET() {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const { scores, updatedAt, withData } = await loadScores();
  return NextResponse.json({
    updatedAt,
    coverage: { withData, total: SP500.length },
    stocks: scores.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      style: s.style,
      quality: s.quality,
      valuation: s.valuation,
      qualityLabel: s.qualityLabel,
      valuationLabel: s.valuationLabel,
      reading: s.reading,
      marketCap: s.marketCap,
    })),
  });
}
