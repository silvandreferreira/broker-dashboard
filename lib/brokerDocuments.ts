import { prisma } from "@/lib/prisma";
import { MY_TRADES } from "@/lib/assetFilter";
import { closeOnOrBefore, fetchCloseSeries, getDailyClosesEur, type DailyCloses } from "@/lib/yahoo";
import { openLotsFifo, t212Category, t212Ticker, type T212Transaction } from "@/lib/t212Parser";

export const BROKERS = { XTB: "XTB", T212: "T212" } as const;
export type Broker = (typeof BROKERS)[keyof typeof BROKERS];
export const BROKER_LABEL: Record<Broker, string> = { XTB: "XTB", T212: "Trading 212" };

export type T212RebuildResult = {
  positions: number;
  unmatchedSells: { ticker: string; shares: number }[];
  noPrice: string[];
};

/**
 * Recalcula as posições Trading 212 de uma entrada a partir de TODAS as ordens dos seus
 * CSV T212 (sem duplicados pelo ID da ordem). Chamar depois de juntar ou apagar um CSV.
 *
 * - Custo em EUR: o "Total" do CSV (já inclui a comissão de câmbio). Ordens pagas noutra
 *   moeda são convertidas com o câmbio desse dia (Yahoo).
 * - Valor atual: último fecho do Yahoo, convertido para EUR.
 */
export async function rebuildT212Assets(fileId: string): Promise<T212RebuildResult> {
  const docs = await prisma.brokerDocument.findMany({
    where: { fileId, broker: BROKERS.T212 },
    select: { transactions: true },
  });
  const byId = new Map<string, T212Transaction>();
  for (const d of docs) for (const tx of (d.transactions as T212Transaction[] | null) ?? []) byId.set(tx.id, tx);
  const { lots, unmatchedSells } = openLotsFifo([...byId.values()]);

  // Câmbios necessários para custos que não estão em EUR
  const fx = new Map<string, DailyCloses>();
  for (const cur of new Set(lots.map((l) => l.totalCurrency).filter((c) => c !== "EUR"))) {
    try {
      fx.set(cur, await fetchCloseSeries(`${cur}EUR=X`, "10y"));
    } catch (e) {
      console.error("[t212 fx]", cur, e);
    }
  }

  const rows = lots.map((lot) => {
    let invested = lot.total;
    if (lot.totalCurrency !== "EUR") {
      const rate = closeOnOrBefore(fx.get(lot.totalCurrency) ?? [], lot.openedAt.slice(0, 10));
      invested = rate ? lot.total * rate : lot.total;
    }
    return { lot, ticker: t212Ticker(lot), invested };
  });

  const firstOpen = rows.length ? new Date(Math.min(...rows.map((r) => Date.parse(r.lot.openedAt)))) : new Date();
  const { series } = rows.length ? await getDailyClosesEur(rows.map((r) => r.ticker), firstOpen) : { series: new Map() };

  const noPrice = new Set<string>();
  const data = rows.map(({ lot, ticker, invested }) => {
    const s: DailyCloses | undefined = series.get(ticker);
    const last = s?.[s.length - 1]?.[1];
    if (last == null) noPrice.add(ticker);
    const currentValue = last != null ? lot.shares * last : invested;
    const category = t212Category(lot.isin, lot.name);
    const openedAt = new Date(lot.openedAt);
    return {
      fileId,
      broker: BROKERS.T212,
      ticker,
      name: lot.name,
      category,
      type: category,
      quantity: lot.shares,
      avgPrice: lot.price,
      investedValue: invested,
      currentValue,
      profitLoss: currentValue - invested,
      year: openedAt.getUTCFullYear(),
      openedAt,
      product: MY_TRADES,
    };
  });

  await prisma.$transaction([
    prisma.asset.deleteMany({ where: { fileId, broker: BROKERS.T212 } }),
    prisma.asset.createMany({ data }),
  ]);
  return { positions: data.length, unmatchedSells, noPrice: [...noPrice].sort() };
}

/**
 * Data de referência da entrada: a mais recente dos seus documentos
 * (relatório XTB, ou a importação do CSV da Trading 212).
 */
export async function entryAsOf(fileId: string, fallback: Date): Promise<Date> {
  const docs = await prisma.brokerDocument.findMany({ where: { fileId }, select: { reportDate: true, uploadedAt: true } });
  const times = docs.map((d) => (d.reportDate ?? d.uploadedAt).getTime());
  return times.length ? new Date(Math.max(...times, fallback.getTime())) : fallback;
}
