import { prisma } from "@/lib/prisma";
import { fetchCloseSeries, toYahooSymbol, type DailyCloses } from "@/lib/yahoo";
import { getTer } from "./etfTer";

/**
 * "Reforçar": quão boa é a altura para comprar mais de cada ETF da carteira.
 *
 * Nota 0–100 (100 = melhor altura), média ponderada de sinais com limites fixos:
 *   Desconto face ao máximo de 52 semanas  30%   0% → 0 · −20% ou mais → 100
 *   Distância à média de 200 dias          25%   +10% → 0 · −10% → 100
 *   RSI (14 dias)                          15%   70 → 0 · 30 → 100
 *   Posição no intervalo do último ano     10%   máximo → 0 · mínimo → 100
 *   Valuation do índice (só S&P 500)       20%   P/E +20% vs mediana 5 anos → 0 · −20% → 100
 * Sinais em falta saem da média (pesos renormalizados).
 *
 * Mostra se o ETF está em desconto face ao próprio histórico; não prevê o que vai acontecer.
 */

/** ETFs cujo índice conseguimos avaliar com os dados das ações do S&P 500. */
const INDEX_UNIVERSE: Record<string, { label: string; sector: string | null }> = {
  SXR8: { label: "S&P 500", sector: null },
  VUAA: { label: "S&P 500", sector: null },
  SPYL: { label: "S&P 500", sector: null },
  CSPX: { label: "S&P 500", sector: null },
  VUSA: { label: "S&P 500", sector: null },
  QDVE: { label: "S&P 500 Tecnologia", sector: "Information Technology" },
};
const baseTicker = (t: string) => t.toUpperCase().replace(/\.[A-Z]{2}$/, "");

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export type IndexValuation = {
  label: string;
  pe: number;
  peMedian5y: number;
  /** P/E atual vs mediana de 5 anos, em % */
  diffPct: number;
  forwardPe: number | null;
  history: { year: string; pe: number }[];
  companies: number;
};

type Row = { symbol: string; sector: string; mc: number | null; pe: number | null; fpe: number | null; pes: { period: string; v: number }[] | null };

let rowsCache: { at: number; rows: Row[] } | null = null;
async function loadIndexRows(): Promise<Row[]> {
  if (rowsCache && Date.now() - rowsCache.at < 6 * 60 * 60 * 1000) return rowsCache.rows;
  // Só os campos necessários (evita trazer as séries completas de 500 ações)
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT symbol, sector,
      (metrics->>'marketCapitalization')::float AS mc,
      (metrics->>'peTTM')::float AS pe,
      (metrics->>'forwardPE')::float AS fpe,
      series->'annual'->'pe' AS pes
    FROM "StockFundamentals"
    WHERE metrics IS NOT NULL`;
  rowsCache = { at: Date.now(), rows };
  return rows;
}

/**
 * P/E agregado (ponderado pela capitalização): Σ cap / Σ (cap / P/E), só empresas com lucro
 * (P/E entre 3x e 500x).
 * Histórico: o mesmo cálculo com o P/E anual de cada empresa (pesos = capitalização atual,
 * aproximação porque não há capitalizações históricas).
 */
async function indexValuation(label: string, sector: string | null): Promise<IndexValuation | null> {
  const rows = (await loadIndexRows()).filter((r) => (sector ? r.sector === sector : true) && r.mc && r.mc > 0);
  // P/E fora de [3, 500] são quase sempre erros de dados (ex.: 0,05) e distorcem a média harmónica
  const validPe = (v: number | null | undefined): v is number => typeof v === "number" && v >= 3 && v <= 500;
  const agg = (pairs: [number, number][]) => {
    const w = pairs.reduce((s, [cap]) => s + cap, 0);
    const e = pairs.reduce((s, [cap, pe]) => s + cap / pe, 0);
    return e > 0 ? w / e : null;
  };
  const current = agg(rows.filter((r) => validPe(r.pe)).map((r) => [r.mc!, r.pe!]));
  const forward = agg(rows.filter((r) => validPe(r.fpe)).map((r) => [r.mc!, r.fpe!]));
  if (!current) return null;

  const thisYear = new Date().getUTCFullYear();
  const history: { year: string; pe: number }[] = [];
  for (let y = thisYear - 6; y <= thisYear - 1; y++) {
    const pairs: [number, number][] = [];
    for (const r of rows) {
      const p = r.pes?.find((x) => x.period.startsWith(String(y)));
      if (p && validPe(p.v)) pairs.push([r.mc!, p.v]);
    }
    // Só anos com cobertura razoável (> 60% das empresas)
    const v = pairs.length > rows.length * 0.6 ? agg(pairs) : null;
    if (v) history.push({ year: String(y), pe: round1(v) });
  }
  const last5 = history.slice(-5).map((h) => h.pe).sort((a, b) => a - b);
  if (last5.length < 3) return null;
  const m = last5.length >> 1;
  const median = last5.length % 2 ? last5[m] : (last5[m - 1] + last5[m]) / 2;
  return {
    label,
    pe: round1(current),
    peMedian5y: round1(median),
    diffPct: round1((current / median - 1) * 100),
    forwardPe: forward ? round1(forward) : null,
    history,
    companies: rows.length,
  };
}

// ---------------------------------------------------------------------------

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= 14;
  loss /= 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * 13 + Math.max(d, 0)) / 14;
    loss = (loss * 13 + Math.max(-d, 0)) / 14;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export type Signal = { key: string; label: string; weight: number; value: string; score: number | null };
export type ReinforceEtf = {
  ticker: string;
  name: string | null;
  currency: string;
  price: number | null;
  /** Custo de gestão anual em % (TER), se conhecido. */
  ter: number | null;
  score: number | null;
  label: string;
  reading: string;
  signals: Signal[];
  returns: { m1: number | null; m3: number | null; y1: number | null };
  /** Últimos 12 meses: [data, fecho, média 200 dias] */
  chart: { date: string; close: number; ma200: number | null }[];
  index: IndexValuation | null;
  alert: { droppingOver10: boolean; alertedAt: string | null };
  error?: string;
};

export function reinforceLabel(s: number | null) {
  if (s === null) return "Sem dados";
  if (s >= 70) return "Boa altura para reforçar";
  if (s >= 55) return "Altura favorável";
  if (s >= 40) return "Neutro";
  if (s >= 25) return "Pouco favorável";
  return "Caro face ao histórico";
}

const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

async function fetchYahooCurrency(symbol: string) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0 (broker-dashboard)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" },
  );
  const json = res.ok ? await res.json() : null;
  return String(json?.chart?.result?.[0]?.meta?.currency ?? "EUR");
}

async function evaluateEtf(
  ticker: string,
  name: string | null,
  alertedAt: Date | null,
): Promise<ReinforceEtf> {
  const symbol = toYahooSymbol(ticker);
  const idxDef = INDEX_UNIVERSE[baseTicker(ticker)];
  const empty: ReinforceEtf = {
    ticker,
    name,
    currency: "EUR",
    price: null,
    ter: getTer(ticker),
    score: null,
    label: reinforceLabel(null),
    reading: "Sem cotações disponíveis.",
    signals: [],
    returns: { m1: null, m3: null, y1: null },
    chart: [],
    index: null,
    alert: { droppingOver10: false, alertedAt: alertedAt?.toISOString() ?? null },
  };
  let series: DailyCloses;
  let currency = "EUR";
  try {
    [series, currency] = await Promise.all([fetchCloseSeries(symbol, "2y"), fetchYahooCurrency(symbol)]);
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
  if (series.length < 30) return { ...empty, error: "Histórico insuficiente" };

  const closes = series.map(([, c]) => c);
  const price = closes[closes.length - 1];
  const lastYear = series.slice(-252);
  const yearCloses = lastYear.map(([, c]) => c);
  const high = Math.max(...yearCloses);
  const low = Math.min(...yearCloses);
  const drop = (price / high - 1) * 100;
  const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((s, c) => s + c, 0) / 200 : null;
  const vsMa = ma200 ? (price / ma200 - 1) * 100 : null;
  const rsi = rsi14(closes.slice(-120));
  const rangePos = high > low ? ((price - low) / (high - low)) * 100 : null;
  const ret = (days: number) => (closes.length > days ? (price / closes[closes.length - 1 - days] - 1) * 100 : null);

  let index: IndexValuation | null = null;
  if (idxDef) {
    try {
      index = await indexValuation(idxDef.label, idxDef.sector);
    } catch (e) {
      console.error("[reinforce] index valuation", e);
    }
  }

  const signals: Signal[] = [
    { key: "drop", label: "Face ao máximo de 52 semanas", weight: 30, value: pctTxt(drop), score: clamp((-drop / 20) * 100) },
    {
      key: "ma200",
      label: "Face à média de 200 dias",
      weight: 25,
      value: vsMa === null ? "—" : pctTxt(vsMa),
      score: vsMa === null ? null : clamp(((10 - vsMa) / 20) * 100),
    },
    {
      key: "rsi",
      label: "RSI (14 dias)",
      weight: 15,
      value: rsi === null ? "—" : rsi.toFixed(0),
      score: rsi === null ? null : clamp(((70 - rsi) / 40) * 100),
    },
    {
      key: "range",
      label: "Posição no intervalo de 1 ano",
      weight: 10,
      value: rangePos === null ? "—" : `${rangePos.toFixed(0)}% (0 = mínimo)`,
      score: rangePos === null ? null : clamp(100 - rangePos),
    },
  ];
  if (index) {
    signals.push({
      key: "valuation",
      label: `P/E do ${index.label} vs mediana de 5 anos`,
      weight: 20,
      value: `${index.pe.toFixed(1).replace(".", ",")}x vs ${index.peMedian5y.toFixed(1).replace(".", ",")}x (${pctTxt(index.diffPct)})`,
      score: clamp(((20 - index.diffPct) / 40) * 100),
    });
  }
  const ok = signals.filter((s) => s.score !== null);
  const w = ok.reduce((s, x) => s + x.weight, 0);
  const score = w ? Math.round(ok.reduce((s, x) => s + x.score! * x.weight, 0) / w) : null;
  for (const s of signals) if (s.score !== null) s.score = Math.round(s.score);

  const parts = [`${pctTxt(drop)} face ao máximo`];
  if (vsMa !== null) parts.push(`${vsMa < 0 ? "abaixo" : "acima"} da média de 200 dias (${pctTxt(vsMa)})`);
  if (rsi !== null) parts.push(rsi <= 30 ? `sobrevendido (RSI ${rsi.toFixed(0)})` : rsi >= 70 ? `sobrecomprado (RSI ${rsi.toFixed(0)})` : `RSI ${rsi.toFixed(0)}`);
  if (index) parts.push(`índice ${index.diffPct > 0 ? "mais caro" : "mais barato"} que a média de 5 anos (${pctTxt(index.diffPct)})`);

  const maBySeries: (number | null)[] = closes.map((_, i) => (i >= 199 ? closes.slice(i - 199, i + 1).reduce((s, c) => s + c, 0) / 200 : null));
  const offset = series.length - lastYear.length;
  return {
    ticker,
    name,
    currency,
    price,
    ter: getTer(ticker),
    score,
    label: reinforceLabel(score),
    reading: parts.join(", ") + ".",
    signals,
    returns: { m1: ret(21), m3: ret(63), y1: ret(252) },
    chart: lastYear.map(([date, close], i) => {
      const ma = maBySeries[offset + i];
      return { date, close: Math.round(close * 100) / 100, ma200: ma === null ? null : Math.round(ma * 100) / 100 };
    }),
    index,
    alert: { droppingOver10: drop <= -10, alertedAt: alertedAt?.toISOString() ?? null },
  };
}

export async function evaluatePortfolioEtfs(
  watches: { ticker: string; name: string | null; alertedAt: Date | null }[],
): Promise<ReinforceEtf[]> {
  const out = await Promise.all(watches.map((w) => evaluateEtf(w.ticker, w.name, w.alertedAt)));
  return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
