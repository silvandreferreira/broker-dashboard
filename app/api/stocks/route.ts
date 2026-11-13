import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { loadScores } from "@/lib/stockData";
import { SP500 } from "@/lib/sp500";
import { fetchLiveQuotes, type LiveQuote } from "@/lib/yahoo";

const QUOTES_TTL_MS = 15 * 60 * 1000;
let quotesCache: { at: number; quotes: Map<string, LiveQuote> } | null = null;

/** Cotações de todo o S&P 500, em cache 15 minutos (≈26 pedidos ao Yahoo). */
async function loadQuotes() {
  if (quotesCache && Date.now() - quotesCache.at < QUOTES_TTL_MS) return quotesCache.quotes;
  const quotes = await fetchLiveQuotes(SP500.map((s) => s.symbol.replace(".", "-")));
  if (quotes.size > 0) quotesCache = { at: Date.now(), quotes };
  return quotes;
}

/** GET /api/stocks — radar: notas de Qualidade e Valuation de todo o S&P 500, com o preço atual. */
export async function GET() {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const [{ scores, updatedAt, withData }, quotes] = await Promise.all([loadScores(), loadQuotes()]);
  return NextResponse.json({
    updatedAt,
    coverage: { withData, total: SP500.length },
    stocks: scores.map((s) => {
      const q = quotes.get(s.symbol.replace(".", "-"));
      return {
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
        price: q?.price ?? null,
        changePct: q?.changePct ?? null,
        currency: q?.currency ?? "USD",
      };
    }),
  });
}
