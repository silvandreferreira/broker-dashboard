import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { dashboardAssetWhere, parseIncludePlans } from "@/lib/assetFilter";
import { getDailyClosesEur } from "@/lib/yahoo";
import { monthlyHistory, yearlyHistory, type HistoryLot } from "@/lib/portfolioHistory";

/**
 * GET /api/dashboard/history?fileId=...
 * Evolução mensal (ano do relatório) e anual da carteira, com preços do Yahoo Finance.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email) && session.user.accessApproved !== true) {
    return NextResponse.json({ error: "Access pending approval" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  const includePlans = parseIncludePlans(searchParams);
  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const file = await prisma.uploadedFile.findFirst({
    where: { id: fileId, user: { email: session.user.email } },
    select: {
      uploadedAt: true,
      reportDate: true,
      assets: {
        where: dashboardAssetWhere(includePlans),
        select: { ticker: true, quantity: true, investedValue: true, currentValue: true, openedAt: true },
      },
    },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const lots: HistoryLot[] = file.assets
    .filter((a) => a.openedAt != null)
    .map((a) => ({
      ticker: a.ticker,
      quantity: a.quantity,
      investedValue: a.investedValue,
      openedAt: a.openedAt!,
    }));

  if (lots.length === 0) {
    return NextResponse.json({
      needsReupload: true,
      error: "Este ficheiro foi carregado antes de existir o histórico. Apaga-o e volta a carregá-lo.",
    });
  }

  const asOf = file.reportDate ?? file.uploadedAt;
  const year = asOf.getUTCFullYear();
  const firstOpen = new Date(Math.min(...lots.map((l) => l.openedAt.getTime())));

  const { series, failed } = await getDailyClosesEur(
    lots.map((l) => l.ticker),
    firstOpen,
  );

  const monthly = monthlyHistory(lots, series, year, asOf);
  const yearly = yearlyHistory(lots, series, asOf);

  // Comparação com o valor que a XTB reporta (só para os tickers com preço)
  const xtbValue = file.assets
    .filter((a) => series.has(a.ticker))
    .reduce((s, a) => s + a.currentValue, 0);

  return NextResponse.json({
    year,
    asOf: asOf.toISOString(),
    monthly,
    yearly,
    failedTickers: failed,
    xtbValue: Math.round(xtbValue * 100) / 100,
  });
}
