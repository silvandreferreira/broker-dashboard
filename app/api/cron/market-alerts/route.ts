import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import {
  ALERT_HOURS_LISBON,
  REARM_THRESHOLD_PCT,
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
 * Cada ETF só gera um alerta quando passa a barreira dos −10% pela primeira vez (AlertWatch.alertedAt);
 * volta a poder alertar depois de recuperar para menos de 8% abaixo do máximo.
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
  const watchByUser = new Map<string, { id: string; ticker: string; alertedAt: Date | null }[]>();
  for (const u of users) {
    const { watches } = await syncWatchlist(u.id);
    watchByUser.set(u.id, watches.filter((w) => w.enabled));
  }

  const allTickers = [...new Set([...watchByUser.values()].flat().map((w) => w.ticker))];
  const checks = await checkTickers(allTickers);
  const byTicker = new Map(checks.map((c) => [c.ticker, c]));

  const report = [];
  const now = new Date();
  for (const [userId, watches] of watchByUser) {
    const newlyDropping = [];
    const rearm: string[] = [];
    for (const w of watches) {
      const c = byTicker.get(w.ticker);
      if (!c || !c.ok) continue; // sem cotação: não mexe no estado
      if (c.dropping && !w.alertedAt) newlyDropping.push({ watchId: w.id, check: c });
      else if (w.alertedAt && c.changePct > -REARM_THRESHOLD_PCT) rearm.push(w.id);
    }
    if (rearm.length) {
      await prisma.alertWatch.updateMany({ where: { id: { in: rearm } }, data: { alertedAt: null } });
    }
    if (newlyDropping.length === 0) {
      report.push({ userId, newlyDropping: 0, rearmed: rearm.length });
      continue;
    }
    const push = await sendPushToUser(userId, buildDropNotification(newlyDropping.map((d) => d.check)));
    // Só marca como avisado se chegou a pelo menos um dispositivo
    if (push.sent > 0) {
      await prisma.alertWatch.updateMany({
        where: { id: { in: newlyDropping.map((d) => d.watchId) } },
        data: { alertedAt: now },
      });
    }
    report.push({ userId, newlyDropping: newlyDropping.length, rearmed: rearm.length, ...push });
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
