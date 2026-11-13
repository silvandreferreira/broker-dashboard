import { prisma } from "@/lib/prisma";

/**
 * Preços históricos do Yahoo Finance (endpoint público, não oficial, sem API key).
 * Os valores podem diferir ligeiramente dos da XTB (hora do preço / bolsa) — assumido.
 *
 * Os fechos diários são guardados em cache na tabela PriceHistory, já convertidos para EUR.
 * Se o Yahoo deixar de funcionar, basta substituir `fetchDailyCloses` por outro fornecedor.
 */

/** [data "YYYY-MM-DD", fecho em EUR], ordenado por data. */
export type DailyCloses = [string, number][];

const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Sufixo de bolsa XTB → sufixo Yahoo. */
const SUFFIX_MAP: Record<string, string> = {
  DE: ".DE",
  NL: ".AS",
  FR: ".PA",
  IT: ".MI",
  ES: ".MC",
  PT: ".LS",
  UK: ".L",
  CH: ".SW",
  BE: ".BR",
  AT: ".VI",
  FI: ".HE",
  DK: ".CO",
  SE: ".ST",
  NO: ".OL",
  PL: ".WA",
  US: "",
};

/** Exceções pontuais em que o ticker XTB não corresponde ao do Yahoo. */
const SYMBOL_OVERRIDES: Record<string, string> = {};

export function toYahooSymbol(xtbTicker: string): string {
  const t = xtbTicker.trim().toUpperCase();
  if (SYMBOL_OVERRIDES[t]) return SYMBOL_OVERRIDES[t];
  const m = t.match(/^(.+)\.([A-Z]{2})$/);
  if (!m) return t;
  const suffix = SUFFIX_MAP[m[2]];
  return suffix === undefined ? t : m[1] + suffix;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type RawSeries = { currency: string; closes: DailyCloses };

async function fetchDailyCloses(symbol: string, from: Date, to: Date): Promise<RawSeries> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${Math.floor(from.getTime() / 1000)}&period2=${Math.floor(to.getTime() / 1000)}` +
    `&interval=1d&events=div,split`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (broker-dashboard)" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: ${json?.chart?.error?.description ?? "sem dados"}`);

  const timestamps: number[] = result.timestamp ?? [];
  const rawCloses: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const closes: DailyCloses = [];
  timestamps.forEach((ts, i) => {
    const c = rawCloses[i];
    if (typeof c === "number" && Number.isFinite(c)) closes.push([isoDate(new Date(ts * 1000)), c]);
  });
  return { currency: String(result.meta?.currency ?? "EUR"), closes };
}

/** Último valor com data <= `date` (série ordenada). */
export function closeOnOrBefore(series: DailyCloses, date: string): number | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let found: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= date) {
      found = series[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

async function fetchInEur(symbol: string, from: Date, to: Date): Promise<RawSeries> {
  const raw = await fetchDailyCloses(symbol, from, to);
  let currency = raw.currency;
  let closes = raw.closes;
  // Bolsa de Londres cota muitas vezes em pence
  if (currency === "GBp" || currency === "GBX") {
    currency = "GBP";
    closes = closes.map(([d, c]) => [d, c / 100]);
  }
  if (currency === "EUR") return { currency: "EUR", closes };

  const fx = await fetchDailyCloses(`${currency}EUR=X`, new Date(from.getTime() - 7 * DAY_MS), to);
  const converted: DailyCloses = [];
  for (const [d, c] of closes) {
    const rate = closeOnOrBefore(fx.closes, d);
    if (rate != null) converted.push([d, c * rate]);
  }
  return { currency, closes: converted };
}

/**
 * Fechos diários em EUR para cada ticker XTB, desde `from` até hoje.
 * Usa a cache; só vai ao Yahoo se a cache não cobrir `from` ou tiver mais de 12h.
 * Tickers que falhem ficam em `failed` (o resto continua a funcionar).
 */
export async function getDailyClosesEur(
  xtbTickers: string[],
  from: Date,
): Promise<{ series: Map<string, DailyCloses>; failed: string[] }> {
  const bySymbol = new Map<string, string[]>();
  for (const t of new Set(xtbTickers)) {
    const s = toYahooSymbol(t);
    bySymbol.set(s, [...(bySymbol.get(s) ?? []), t]);
  }
  const symbols = [...bySymbol.keys()];
  const cached = await prisma.priceHistory.findMany({ where: { symbol: { in: symbols } } });
  const cacheMap = new Map(cached.map((c) => [c.symbol, c]));

  const now = new Date();
  const series = new Map<string, DailyCloses>();
  const failed: string[] = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      const hit = cacheMap.get(symbol);
      const fresh =
        hit &&
        hit.fromDate.getTime() <= from.getTime() &&
        now.getTime() - hit.fetchedAt.getTime() < REFRESH_AFTER_MS;

      let closes: DailyCloses | undefined = fresh ? (hit.closes as DailyCloses) : undefined;
      if (!closes) {
        // Pedir uns dias antes para ter fecho válido mesmo que `from` calhe num fim de semana
        const fetchFrom = new Date(
          Math.min(from.getTime(), hit?.fromDate.getTime() ?? Infinity) - 7 * DAY_MS,
        );
        try {
          const data = await fetchInEur(symbol, fetchFrom, now);
          closes = data.closes;
          await prisma.priceHistory.upsert({
            where: { symbol },
            create: { symbol, currency: data.currency, fromDate: fetchFrom, closes, fetchedAt: now },
            update: { currency: data.currency, fromDate: fetchFrom, closes, fetchedAt: now },
          });
        } catch (e) {
          console.error("[yahoo]", e);
          // Cache antiga é melhor do que nada
          if (hit) closes = hit.closes as DailyCloses;
        }
      }
      for (const t of bySymbol.get(symbol)!) {
        if (closes && closes.length > 0) series.set(t, closes);
        else failed.push(t);
      }
    }),
  );

  return { series, failed: failed.sort() };
}

export type DropFromHigh = {
  symbol: string;
  currency: string;
  /** Último preço (intradiário, ~15 min de atraso) */
  price: number;
  /** Fecho mais alto das últimas 52 semanas (ou o preço atual, se for maior) */
  high: number;
  highDate: string;
  /** Variação face ao máximo, em % (negativo = queda) */
  changePct: number;
  priceTime: string;
};

/**
 * Preço atual vs máximo das últimas 52 semanas, na moeda do próprio ETF
 * (sem conversão cambial, para medir só o comportamento do ETF). Sem cache: é para alertas.
 */
export async function fetchDropFromHigh(xtbTicker: string): Promise<DropFromHigh> {
  const symbol = toYahooSymbol(xtbTicker);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (broker-dashboard)" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: ${json?.chart?.error?.description ?? "sem dados"}`);

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  let high = -Infinity;
  let highDate = "";
  let lastClose: number | undefined;
  timestamps.forEach((ts, i) => {
    const c = closes[i];
    if (typeof c !== "number" || !Number.isFinite(c)) return;
    lastClose = c;
    if (c > high) {
      high = c;
      highDate = isoDate(new Date(ts * 1000));
    }
  });

  const metaPrice = result.meta?.regularMarketPrice;
  const price = typeof metaPrice === "number" && Number.isFinite(metaPrice) ? metaPrice : lastClose;
  if (price == null || !Number.isFinite(high)) throw new Error(`Yahoo ${symbol}: sem preços`);
  const priceTime = result.meta?.regularMarketTime
    ? new Date(result.meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();
  if (price > high) {
    high = price;
    highDate = priceTime.slice(0, 10);
  }

  return {
    symbol,
    currency: String(result.meta?.currency ?? "EUR"),
    price,
    high,
    highDate,
    changePct: (price / high - 1) * 100,
    priceTime,
  };
}

/** Fechos diários "crus" (moeda original) de um símbolo Yahoo, para um `range` como "5y". */
export async function fetchCloseSeries(symbol: string, range: string): Promise<DailyCloses> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (broker-dashboard)" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: sem dados`);
  const ts: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const out: DailyCloses = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) out.push([isoDate(new Date(t * 1000)), c]);
  });
  return out;
}

export type LiveQuote = { price: number; changePct: number | null; currency: string };

/**
 * Cotação atual de muitos símbolos de uma vez (endpoint "spark": até 20 símbolos por pedido).
 * Símbolos sem resposta ficam de fora do mapa.
 */
export async function fetchLiveQuotes(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const out = new Map<string, LiveQuote>();
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  const run = async (batch: string[]) => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${batch.map(encodeURIComponent).join(",")}&range=1d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 (broker-dashboard)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" },
      );
      if (!res.ok) return;
      const json = await res.json();
      for (const r of json?.spark?.result ?? []) {
        const meta = r?.response?.[0]?.meta;
        if (typeof meta?.regularMarketPrice !== "number") continue;
        out.set(String(r.symbol), {
          price: meta.regularMarketPrice,
          changePct: typeof meta.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent : null,
          currency: String(meta.currency ?? "USD"),
        });
      }
    } catch (e) {
      console.error("[yahoo spark]", e);
    }
  };
  // 5 pedidos em paralelo de cada vez, para não abusar do Yahoo.
  for (let i = 0; i < batches.length; i += 5) await Promise.all(batches.slice(i, i + 5).map(run));
  return out;
}
