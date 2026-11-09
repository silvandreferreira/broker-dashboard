import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { ALERT_HOURS_LISBON, DROP_THRESHOLD_PCT, syncWatchlist } from "@/lib/marketAlerts";

/** GET /api/alerts — config dos alertas (ETFs vigiados + n.º de dispositivos com push). */
export async function GET() {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const [list, devices] = await Promise.all([
    syncWatchlist(auth.userId),
    prisma.pushSubscription.count({ where: { userId: auth.userId } }),
  ]);
  return NextResponse.json({
    thresholdPct: DROP_THRESHOLD_PCT,
    hours: ALERT_HOURS_LISBON,
    devices,
    sourceFile: list.sourceFile,
    watches: list.watches.map((w) => ({
      ticker: w.ticker,
      name: w.name,
      enabled: w.enabled,
      alertedAt: w.alertedAt,
      inLatestFile: w.inLatestFile,
    })),
  });
}

/** PATCH /api/alerts { ticker, enabled } — ligar/desligar um ETF. */
export async function PATCH(req: NextRequest) {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  if (typeof body?.ticker !== "string" || typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const res = await prisma.alertWatch.updateMany({
    where: { userId: auth.userId, ticker: body.ticker },
    data: { enabled: body.enabled },
  });
  if (res.count === 0) return NextResponse.json({ error: "ETF não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
