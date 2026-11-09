import { prisma } from "@/lib/prisma";
import { fetchDropFromHigh, type DropFromHigh } from "@/lib/yahoo";

/** Alerta quando um ETF está mais de X% abaixo do máximo das últimas 52 semanas. */
export const DROP_THRESHOLD_PCT = 10;

/** Horas (Lisboa) a que corre a verificação agendada. */
export const ALERT_HOURS_LISBON = [9, 12, 14];

/**
 * Garante que a lista de ETFs vigiados inclui os ETFs do último ficheiro carregado.
 * ETFs novos entram ligados; os que o utilizador desligou ficam como estão.
 */
export async function syncWatchlist(userId: string) {
  const latest = await prisma.uploadedFile.findFirst({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      uploadedAt: true,
      assets: { where: { category: "ETF" }, select: { ticker: true, name: true }, distinct: ["ticker"] },
    },
  });
  if (latest && latest.assets.length) {
    await prisma.alertWatch.createMany({
      data: latest.assets.map((a) => ({ userId, ticker: a.ticker, name: a.name })),
      skipDuplicates: true,
    });
  }
  const watches = await prisma.alertWatch.findMany({ where: { userId }, orderBy: { ticker: "asc" } });
  const inLatest = new Set(latest?.assets.map((a) => a.ticker) ?? []);
  return {
    sourceFile: latest ? { fileName: latest.fileName, uploadedAt: latest.uploadedAt } : null,
    watches: watches.map((w) => ({ ...w, inLatestFile: inLatest.has(w.ticker) })),
  };
}

export type TickerCheck =
  | ({ ticker: string; ok: true; dropping: boolean } & DropFromHigh)
  | { ticker: string; ok: false; error: string };

export async function checkTickers(tickers: string[]): Promise<TickerCheck[]> {
  return Promise.all(
    tickers.map(async (ticker): Promise<TickerCheck> => {
      try {
        const d = await fetchDropFromHigh(ticker);
        return { ticker, ok: true, dropping: d.changePct <= -DROP_THRESHOLD_PCT, ...d };
      } catch (e) {
        return { ticker, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

/** Texto da notificação para os ETFs em queda. */
export function buildDropNotification(dropping: Extract<TickerCheck, { ok: true }>[]) {
  const sorted = [...dropping].sort((a, b) => a.changePct - b.changePct);
  const n = sorted.length;
  return {
    title: `${n} ETF${n > 1 ? "s" : ""} em queda de mais de ${DROP_THRESHOLD_PCT}%`,
    body: sorted.map((d) => `${d.ticker} ${pct(d.changePct)} face ao máximo de 52 semanas`).join("\n"),
    url: "/",
    tag: "market-drop",
  };
}

/** Data e hora atuais em Lisboa: { date: "YYYY-MM-DD", hour: 0-23 } */
export function lisbonNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}
