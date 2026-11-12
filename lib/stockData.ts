import { prisma } from "@/lib/prisma";
import { finnhub, sleep, type MetricResponse } from "@/lib/finnhub";
import { SP500 } from "@/lib/sp500";
import { compactMetricResponse, scoreUniverse, type Metrics, type StockScore } from "@/lib/stockScores";
import { closeOnOrBefore, fetchCloseSeries } from "@/lib/yahoo";

/** Fundamentais com mais de 20h são atualizados no próximo lote. */
const STALE_AFTER_MS = 20 * 60 * 60 * 1000;
/** Detalhe (analistas, resultados, insiders) fica em cache 24h. */
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
/** Plano gratuito do Finnhub: 60 pedidos/minuto → 1 pedido a cada ~1,1 s. */
const REQUEST_GAP_MS = 1100;

/**
 * Atualiza os fundamentais das ações mais desatualizadas até `deadline` (ms epoch).
 * Corre em lotes (cron diário), porque o S&P 500 inteiro demora ~9 min com o limite gratuito.
 */
export async function refreshFundamentals(deadline: number, maxSymbols = 500) {
  const existing = await prisma.stockFundamentals.findMany({ select: { symbol: true, fetchedAt: true, metrics: true } });
  const bySymbol = new Map(existing.map((e) => [e.symbol, e]));
  const now = Date.now();
  const queue = SP500.filter((c) => {
    const e = bySymbol.get(c.symbol);
    return !e || !e.metrics || now - e.fetchedAt.getTime() > STALE_AFTER_MS;
  })
    .sort((a, b) => (bySymbol.get(a.symbol)?.fetchedAt.getTime() ?? 0) - (bySymbol.get(b.symbol)?.fetchedAt.getTime() ?? 0))
    .slice(0, maxSymbols);

  // Empresas que saíram do índice
  const inIndex = new Set(SP500.map((c) => c.symbol));
  const removed = existing.filter((e) => !inIndex.has(e.symbol)).map((e) => e.symbol);
  if (removed.length) await prisma.stockFundamentals.deleteMany({ where: { symbol: { in: removed } } });

  let ok = 0;
  const failed: string[] = [];
  for (const c of queue) {
    if (Date.now() + REQUEST_GAP_MS + 15_000 > deadline) break;
    const started = Date.now();
    try {
      const r = await finnhub<MetricResponse>("/stock/metric", { symbol: c.symbol, metric: "all" });
      const { metrics, series } = compactMetricResponse(r);
      const data = { name: c.name, sector: c.sector, industry: c.industry, metrics, series, error: null, fetchedAt: new Date() };
      await prisma.stockFundamentals.upsert({ where: { symbol: c.symbol }, create: { symbol: c.symbol, ...data }, update: data });
      ok++;
    } catch (e) {
      const status = (e as { status?: number }).status;
      failed.push(c.symbol);
      if (status === 429) {
        await sleep(60_000); // limite atingido: esperar um minuto
        continue;
      }
      const error = e instanceof Error ? e.message : String(e);
      await prisma.stockFundamentals.upsert({
        where: { symbol: c.symbol },
        create: { symbol: c.symbol, name: c.name, sector: c.sector, industry: c.industry, error, fetchedAt: new Date() },
        update: { error, fetchedAt: new Date() },
      });
    }
    const wait = REQUEST_GAP_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
  }
  return { pending: queue.length, updated: ok, failed, removed };
}

let scoreCache: { at: number; scores: StockScore[]; updatedAt: string | null; withData: number } | null = null;

/** Notas de todo o S&P 500 (cache em memória de 10 min). */
export async function loadScores() {
  if (scoreCache && Date.now() - scoreCache.at < 10 * 60 * 1000) return scoreCache;
  const rows = await prisma.stockFundamentals.findMany({
    select: { symbol: true, name: true, sector: true, industry: true, metrics: true, fetchedAt: true },
  });
  const withMetrics = rows.filter((r) => r.metrics && typeof r.metrics === "object");
  const scores = scoreUniverse(
    withMetrics.map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector, industry: r.industry, metrics: r.metrics as Metrics })),
  );
  const updatedAt = withMetrics.length
    ? new Date(Math.max(...withMetrics.map((r) => r.fetchedAt.getTime()))).toISOString()
    : null;
  scoreCache = { at: Date.now(), scores, updatedAt, withData: withMetrics.length };
  return scoreCache;
}

// ---------------------------------------------------------------------------

type Profile = {
  country?: string;
  exchange?: string;
  ipo?: string;
  logo?: string;
  marketCapitalization?: number;
  name?: string;
  weburl?: string;
  finnhubIndustry?: string;
  currency?: string;
};
type Recommendation = { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
type Earning = { period: string; quarter: number; year: number; actual: number | null; estimate: number | null; surprise: number | null; surprisePercent: number | null };
type InsiderTx = {
  name: string;
  share: number;
  change: number;
  filingDate: string;
  transactionDate: string;
  transactionCode: string;
  transactionPrice: number;
};

export type MomentumRow = { label: string; stock: number | null; sp500: number | null };
export type StockDetail = {
  profile: Profile;
  recommendations: Recommendation[];
  earnings: Earning[];
  insider: { purchases: number; sales: number; other: number; transactions: InsiderTx[] };
  momentum: MomentumRow[];
  price: number | null;
  errors: string[];
};

const yahooUsSymbol = (s: string) => s.replace(/\./g, "-");

function returnsFrom(closes: [string, number][], last: string) {
  const end = closeOnOrBefore(closes, last);
  const at = (days: number) => {
    const d = new Date(new Date(`${last}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const start = closeOnOrBefore(closes, d);
    return end && start && closes[0][0] <= d ? (end / start - 1) * 100 : null;
  };
  return { m1: at(30), m3: at(91), y1: at(365), y3: at(365 * 3) };
}

async function fetchDetail(symbol: string): Promise<StockDetail> {
  const errors: string[] = [];
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      console.error("[stock-detail]", label, e);
      errors.push(label);
      return fallback;
    }
  };
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [profile, recommendations, earnings, insiderRaw, stockCloses, spCloses] = await Promise.all([
    safe("perfil", () => finnhub<Profile>("/stock/profile2", { symbol }), {}),
    safe("analistas", () => finnhub<Recommendation[]>("/stock/recommendation", { symbol }), []),
    safe("resultados", () => finnhub<Earning[]>("/stock/earnings", { symbol }), []),
    safe("insiders", () => finnhub<{ data?: InsiderTx[] }>("/stock/insider-transactions", { symbol, from }), {}),
    safe("cotações", () => fetchCloseSeries(yahooUsSymbol(symbol), "5y"), []),
    safe("S&P 500", () => fetchCloseSeries("^GSPC", "5y"), []),
  ]);

  const tx = (insiderRaw.data ?? [])
    .filter((t) => t.transactionDate)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const momentum: MomentumRow[] = [];
  if (stockCloses.length && spCloses.length) {
    const last = stockCloses[stockCloses.length - 1][0];
    const s = returnsFrom(stockCloses, last);
    const b = returnsFrom(spCloses, last);
    momentum.push(
      { label: "1 mês", stock: s.m1, sp500: b.m1 },
      { label: "3 meses", stock: s.m3, sp500: b.m3 },
      { label: "1 ano", stock: s.y1, sp500: b.y1 },
      { label: "3 anos", stock: s.y3, sp500: b.y3 },
    );
  }
  return {
    profile,
    recommendations: [...recommendations].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 6),
    earnings: [...earnings].sort((a, b) => b.period.localeCompare(a.period)),
    insider: {
      purchases: tx.filter((t) => t.transactionCode === "P").length,
      sales: tx.filter((t) => t.transactionCode === "S").length,
      other: tx.filter((t) => t.transactionCode !== "P" && t.transactionCode !== "S").length,
      transactions: tx.filter((t) => t.transactionCode === "P" || t.transactionCode === "S").slice(0, 25),
    },
    momentum,
    price: stockCloses.length ? stockCloses[stockCloses.length - 1][1] : null,
    errors,
  };
}

/** Detalhe de uma ação, com cache de 24h (só guarda se não houve erros). */
export async function getStockDetail(symbol: string): Promise<{ detail: StockDetail; fetchedAt: string }> {
  const hit = await prisma.stockDetailCache.findUnique({ where: { symbol } });
  if (hit && Date.now() - hit.fetchedAt.getTime() < DETAIL_TTL_MS) {
    return { detail: hit.data as unknown as StockDetail, fetchedAt: hit.fetchedAt.toISOString() };
  }
  const detail = await fetchDetail(symbol);
  const fetchedAt = new Date();
  if (detail.errors.length === 0) {
    const data = detail as unknown as object;
    await prisma.stockDetailCache.upsert({
      where: { symbol },
      create: { symbol, data, fetchedAt },
      update: { data, fetchedAt },
    });
  }
  return { detail, fetchedAt: fetchedAt.toISOString() };
}
