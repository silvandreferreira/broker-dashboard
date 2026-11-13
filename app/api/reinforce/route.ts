import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { syncWatchlist } from "@/lib/marketAlerts";
import { evaluatePortfolioEtfs } from "@/lib/reinforce";

/** GET /api/reinforce — "momento para reforçar" de cada ETF do último ficheiro carregado. */
export async function GET() {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const { sourceFile, watches } = await syncWatchlist(auth.userId);
  const etfs = await evaluatePortfolioEtfs(
    watches.filter((w) => w.inLatestFile).map((w) => ({ ticker: w.ticker, name: w.name, alertedAt: w.alertedAt })),
  );
  return NextResponse.json({ checkedAt: new Date().toISOString(), sourceFile, etfs });
}
