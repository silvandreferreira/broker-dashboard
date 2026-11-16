import { prisma } from "@/lib/prisma";
import { fetchDropFromHigh, type DropFromHigh } from "@/lib/yahoo";

/** Alerta quando um ETF ou ação está mais de X% abaixo do máximo das últimas 52 semanas. */
export const DROP_THRESHOLD_PCT = 10;

/**
 * Só se volta a avisar depois de o ETF recuperar para menos de X% abaixo do máximo.
 * Evita alertas repetidos quando o preço anda à volta dos −10%.
 */
export const REARM_THRESHOLD_PCT = 8;

/** Horas (Lisboa) a que corre a verificação agendada. */
export const ALERT_HOURS_LISBON = [9, 12, 14];

/**
 * Garante que a lista vigiada inclui os ETFs e ações do último ficheiro carregado
 * (todas as corretoras da entrada). Novos entram ligados; os desligados ficam como estão.
 */
export async function syncWatchlist(userId: string) {
  const latest = await prisma.uploadedFile.findFirst({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      uploadedAt: true,
      assets: {
        where: { category: { in: ["ETF", "STOCK"] } },
        select: { ticker: true, name: true, category: true },
        distinct: ["ticker"],
      },
    },
  });
  if (latest && latest.assets.length) {
    await prisma.alertWatch.createMany({
      data: latest.assets.map((a) => ({ userId, ticker: a.ticker, name: a.name })),
      skipDuplicates: true,
    });
  }
  const watches = await prisma.alertWatch.findMany({ where: { userId }, orderBy: { ticker: "asc" } });
  const categoryOf = new Map(latest?.assets.map((a) => [a.ticker, a.category]) ?? []);
  return {
    sourceFile: latest ? { fileName: latest.fileName, uploadedAt: latest.uploadedAt } : null,
    watches: watches.map((w) => ({
      ...w,
      inLatestFile: categoryOf.has(w.ticker),
      /** "ETF" | "STOCK" | null (já não está no último ficheiro) */
      category: categoryOf.get(w.ticker) ?? null,
    })),
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

/** Texto da notificação para os ETFs/ações em queda. */
export function buildDropNotification(dropping: Extract<TickerCheck, { ok: true }>[]) {
  const sorted = [...dropping].sort((a, b) => a.changePct - b.changePct);
  const n = sorted.length;
  return {
    title: `${n} ${n > 1 ? "ativos" : "ativo"} em queda de mais de ${DROP_THRESHOLD_PCT}%`,
    body: sorted.map((d) => `${d.ticker.split(".")[0]} ${pct(d.changePct)} face ao máximo de 52 semanas`).join("\n"),
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
