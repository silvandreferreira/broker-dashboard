import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import {
  ALERT_HOURS_LISBON,
  buildDropNotification,
  checkTickers,
  lisbonNow,
  syncWatchlist,
} from "@/lib/marketAlerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/market-alerts — chamado pelos Vercel Cron Jobs (ver vercel.json).
 *
 * Os crons estão em UTC e correm a duas horas UTC por cada horário (hora de inverno e de verão);
 * só avança se a hora atual em Lisboa for 9h, 12h ou 14h. Cada horário só é processado uma vez.
 * `?force=1` ignora a hora e o registo (para testes; exige o mesmo segredo).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const { date, hour } = lisbonNow();

  if (!force) {
    if (!ALERT_HOURS_LISBON.includes(hour)) {
      return NextResponse.json({ skipped: `fora de horário (${hour}h em Lisboa)` });
    }
    const slot = `${date} ${String(hour).padStart(2, "0")}`;
    try {
      await prisma.alertRun.create({ data: { slot } });
    } catch {
      return NextResponse.json({ skipped: `horário ${slot} já processado` });
    }
  }

  // Só utilizadores com pelo menos um dispositivo para receber
  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    select: { id: true },
  });
  const watchByUser = new Map<string, string[]>();
  for (const u of users) {
    const { watches } = await syncWatchlist(u.id);
    watchByUser.set(u.id, watches.filter((w) => w.enabled).map((w) => w.ticker));
  }

  const allTickers = [...new Set([...watchByUser.values()].flat())];
  const checks = await checkTickers(allTickers);
  const byTicker = new Map(checks.map((c) => [c.ticker, c]));

  const report = [];
  for (const [userId, tickers] of watchByUser) {
    const dropping = tickers
      .map((t) => byTicker.get(t))
      .filter((c): c is Extract<typeof c, { ok: true }> => !!c && c.ok && c.dropping);
    if (dropping.length === 0) {
      report.push({ userId, dropping: 0 });
      continue;
    }
    const push = await sendPushToUser(userId, buildDropNotification(dropping));
    report.push({ userId, dropping: dropping.length, ...push });
  }

  const summary = {
    lisbon: `${date} ${hour}h`,
    force,
    tickers: checks.map((c) =>
      c.ok ? { ticker: c.ticker, changePct: Math.round(c.changePct * 100) / 100 } : { ticker: c.ticker, error: c.error },
    ),
    report,
  };
  if (!force) {
    await prisma.alertRun
      .update({ where: { slot: `${date} ${String(hour).padStart(2, "0")}` }, data: { summary } })
      .catch(() => undefined);
  }
  return NextResponse.json(summary);
}
