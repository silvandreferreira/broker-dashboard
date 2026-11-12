import type { MetricResponse, SeriesPoint } from "@/lib/finnhub";

/**
 * Notas de Qualidade e Valuation (0–100) para as ações do S&P 500.
 *
 * Cada indicador é convertido num percentil face às outras ações do índice
 * (100 = melhor do universo). Um pilar é a média dos percentis dos seus indicadores;
 * a nota é a média ponderada dos pilares disponíveis (pesos renormalizados).
 * Sem pelo menos 2 pilares, a nota fica vazia ("sem dados suficientes").
 *
 * Fórmula própria, inspirada na estrutura do Clareza: os números não coincidem com os dele.
 * Serve para filtrar ideias, não é recomendação de investimento.
 */

/** Métricas do Finnhub guardadas (as restantes são descartadas para poupar espaço). */
export const KEPT_METRICS = [
  "peTTM",
  "peBasicExclExtraTTM",
  "forwardPE",
  "pbQuarterly",
  "pbAnnual",
  "psTTM",
  "pfcfShareTTM",
  "evEbitdaTTM",
  "roiTTM",
  "roeTTM",
  "grossMarginTTM",
  "netProfitMarginTTM",
  "operatingMarginTTM",
  "revenueGrowth3Y",
  "revenueGrowth5Y",
  "epsGrowth3Y",
  "epsGrowth5Y",
  "revenueGrowthTTMYoy",
  "epsGrowthTTMYoy",
  "totalDebt/totalEquityQuarterly",
  "totalDebt/totalEquityAnnual",
  "currentRatioQuarterly",
  "netInterestCoverageTTM",
  "netInterestCoverageAnnual",
  "marketCapitalization",
  "enterpriseValue",
  "currentDividendYieldTTM",
  "dividendYieldIndicatedAnnual",
  "payoutRatioTTM",
  "beta",
  "52WeekHigh",
  "52WeekLow",
  "52WeekPriceReturnDaily",
  "epsTTM",
] as const;

export const KEPT_SERIES = [
  "eps",
  "pe",
  "pb",
  "ps",
  "grossMargin",
  "netMargin",
  "operatingMargin",
  "roic",
  "roe",
  "fcfMargin",
  "salesPerShare",
  "totalDebtToEquity",
  "currentRatio",
] as const;

export type Metrics = Record<string, number>;
export type Series = { annual: Record<string, SeriesPoint[]>; quarterly: Record<string, SeriesPoint[]> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Série ordenada do mais antigo para o mais recente, limitada aos últimos `n` pontos. */
function lastPoints(points: SeriesPoint[] | undefined, n: number): SeriesPoint[] {
  return (points ?? [])
    .filter((p) => num(p.v) !== undefined)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-n);
}

/** Reduz a resposta do Finnhub ao que é guardado, e calcula métricas derivadas das séries. */
export function compactMetricResponse(r: MetricResponse): { metrics: Metrics; series: Series } {
  const metrics: Metrics = {};
  for (const k of KEPT_METRICS) {
    const v = num(r.metric?.[k]);
    if (v !== undefined) metrics[k] = v;
  }
  const series: Series = { annual: {}, quarterly: {} };
  for (const k of KEPT_SERIES) {
    const a = lastPoints(r.series?.annual?.[k], 10);
    const q = lastPoints(r.series?.quarterly?.[k], 16);
    if (a.length) series.annual[k] = a;
    if (q.length) series.quarterly[k] = q;
  }

  // P/E mediano dos últimos 5 anos (só anos com lucro)
  const pe5 = lastPoints(r.series?.annual?.pe, 5).map((p) => p.v).filter((v) => v > 0);
  const peMedian = median(pe5);
  if (peMedian !== undefined && pe5.length >= 3) metrics._peMedian5y = peMedian;

  // Consistência: % de anos (últimos 5) com EPS a crescer, e estabilidade da margem líquida
  const eps = lastPoints(r.series?.annual?.eps, 6).map((p) => p.v);
  if (eps.length >= 4) {
    let up = 0;
    for (let i = 1; i < eps.length; i++) if (eps[i] > eps[i - 1]) up++;
    metrics._epsUpYearsPct = (up / (eps.length - 1)) * 100;
    metrics._epsPositiveYearsPct = (eps.filter((v) => v > 0).length / eps.length) * 100;
  }
  const nm = lastPoints(r.series?.annual?.netMargin, 5).map((p) => p.v);
  if (nm.length >= 4) {
    const mean = nm.reduce((s, v) => s + v, 0) / nm.length;
    metrics._netMarginStd = Math.sqrt(nm.reduce((s, v) => s + (v - mean) ** 2, 0) / nm.length);
  }
  return { metrics, series };
}

// ---------------------------------------------------------------------------

type Direction = "higher" | "lower";
type IndicatorDef = {
  key: string;
  label: string;
  direction: Direction;
  /** Valor do indicador para uma ação (undefined = sem dados / não aplicável) */
  value: (m: Metrics, ctx: Ctx) => number | undefined;
  unit?: "%" | "x" | "";
};
type PillarDef = { key: string; label: string; weight: number; indicators: IndicatorDef[] };
type Ctx = { sectorPeMedian?: number };

const pos = (v: number | undefined) => (v !== undefined && v > 0 ? v : undefined);
const pe = (m: Metrics) => pos(m.peTTM ?? m.peBasicExclExtraTTM);
const debtToEquity = (m: Metrics) => {
  const v = m["totalDebt/totalEquityQuarterly"] ?? m["totalDebt/totalEquityAnnual"];
  if (v === undefined) return undefined;
  return v < 0 ? 99 : v; // capital próprio negativo = pior caso
};

export const QUALITY_PILLARS: PillarDef[] = [
  {
    key: "profitability",
    label: "Rentabilidade",
    weight: 35,
    indicators: [
      { key: "roic", label: "ROIC", direction: "higher", value: (m) => m.roiTTM, unit: "%" },
      { key: "netMargin", label: "Margem líquida", direction: "higher", value: (m) => m.netProfitMarginTTM, unit: "%" },
      { key: "grossMargin", label: "Margem bruta", direction: "higher", value: (m) => m.grossMarginTTM, unit: "%" },
    ],
  },
  {
    key: "growth",
    label: "Crescimento",
    weight: 25,
    indicators: [
      { key: "revGrowth", label: "Receita · CAGR 3A", direction: "higher", value: (m) => m.revenueGrowth3Y, unit: "%" },
      { key: "epsGrowth", label: "Lucro (EPS) · CAGR 3A", direction: "higher", value: (m) => m.epsGrowth3Y, unit: "%" },
      { key: "revTtm", label: "Receita · últimos 12M", direction: "higher", value: (m) => m.revenueGrowthTTMYoy, unit: "%" },
    ],
  },
  {
    key: "balance",
    label: "Saúde do balanço",
    weight: 25,
    indicators: [
      { key: "debtEquity", label: "Dívida / Capital próprio", direction: "lower", value: debtToEquity, unit: "x" },
      { key: "currentRatio", label: "Liquidez corrente", direction: "higher", value: (m) => m.currentRatioQuarterly, unit: "x" },
      {
        key: "interestCoverage",
        label: "Cobertura de juros",
        direction: "higher",
        value: (m) => m.netInterestCoverageTTM ?? m.netInterestCoverageAnnual,
        unit: "x",
      },
    ],
  },
  {
    key: "consistency",
    label: "Consistência",
    weight: 15,
    indicators: [
      { key: "epsUp", label: "Anos com EPS a crescer", direction: "higher", value: (m) => m._epsUpYearsPct, unit: "%" },
      { key: "epsPositive", label: "Anos com lucro", direction: "higher", value: (m) => m._epsPositiveYearsPct, unit: "%" },
      { key: "marginStd", label: "Variação da margem líquida", direction: "lower", value: (m) => m._netMarginStd, unit: "%" },
    ],
  },
];

export const VALUATION_PILLARS: PillarDef[] = [
  {
    key: "history",
    label: "Face à própria história",
    weight: 35,
    indicators: [
      {
        key: "peVsHistory",
        label: "P/E atual vs mediana de 5 anos",
        direction: "lower",
        value: (m) => {
          const p = pe(m);
          return p !== undefined && m._peMedian5y ? (p / m._peMedian5y - 1) * 100 : undefined;
        },
        unit: "%",
      },
    ],
  },
  {
    key: "sector",
    label: "Face ao setor",
    weight: 25,
    indicators: [
      {
        key: "peVsSector",
        label: "P/E vs mediana do setor",
        direction: "lower",
        value: (m, ctx) => {
          const p = pe(m);
          return p !== undefined && ctx.sectorPeMedian ? (p / ctx.sectorPeMedian - 1) * 100 : undefined;
        },
        unit: "%",
      },
    ],
  },
  {
    key: "peg",
    label: "Múltiplo vs crescimento",
    weight: 20,
    indicators: [
      {
        key: "peg",
        label: "PEG (P/E ÷ crescimento do lucro)",
        direction: "lower",
        value: (m) => {
          const p = pe(m);
          const g = pos(m.epsGrowth3Y);
          return p !== undefined && g !== undefined ? p / g : undefined;
        },
        unit: "x",
      },
    ],
  },
  {
    key: "fcf",
    label: "Rendimento do free cash flow",
    weight: 20,
    indicators: [
      {
        key: "fcfYield",
        label: "FCF yield",
        direction: "higher",
        value: (m) => {
          const p = num(m.pfcfShareTTM);
          return p !== undefined && p !== 0 ? 100 / p : undefined;
        },
        unit: "%",
      },
    ],
  },
];

export type StockInput = { symbol: string; name: string; sector: string; industry: string | null; metrics: Metrics };

export type PillarResult = {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  indicators: { key: string; label: string; value: number | null; unit?: string; percentile: number | null }[];
};

export type StockScore = {
  symbol: string;
  name: string;
  sector: string;
  industry: string | null;
  style: "Growth" | "Value" | "REIT";
  quality: number | null;
  valuation: number | null;
  qualityLabel: string;
  valuationLabel: string;
  /** "Top X%" dentro do S&P 500 (menor = melhor) */
  qualityTopPct: number | null;
  valuationTopPct: number | null;
  reading: string;
  tags: string[];
  marketCap: number | null;
  qualityPillars: PillarResult[];
  valuationPillars: PillarResult[];
  sectorPeMedian: number | null;
};

/** Percentil (0–100, 100 = melhor) de cada valor dentro da lista. */
function percentileFn(values: number[], direction: Direction) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (x: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const below = lo;
    let hiEq = lo;
    while (hiEq < n && sorted[hiEq] === x) hiEq++;
    const p = ((below + (hiEq - below) / 2) / n) * 100;
    return direction === "higher" ? p : 100 - p;
  };
}

export function valuationLabel(v: number | null) {
  if (v === null) return "Sem dados";
  if (v >= 80) return "Muito barato";
  if (v >= 60) return "Barato";
  if (v >= 40) return "Preço justo";
  if (v >= 20) return "Caro";
  return "Muito caro";
}
export function qualityLabel(q: number | null) {
  if (q === null) return "Sem dados";
  if (q >= 75) return "Excelente";
  if (q >= 55) return "Boa";
  if (q >= 35) return "Média";
  return "Fraca";
}
function readingFor(q: number | null, v: number | null) {
  if (q === null || v === null) return "Sem dados suficientes para uma leitura.";
  const business = q >= 75 ? "Excelente negócio" : q >= 55 ? "Bom negócio" : q >= 35 ? "Negócio mediano" : "Negócio fraco";
  if (q < 35 && v >= 60) return "Barato, mas a qualidade é fraca: cuidado.";
  const price = v >= 60 ? " a um preço atrativo" : v >= 40 ? " a preço justo" : ", mas caro";
  return `${business}${price}.`;
}

/** Calcula as notas de todas as ações (o percentil precisa do universo inteiro). */
export function scoreUniverse(stocks: StockInput[]): StockScore[] {
  // Mediana do P/E por setor (só empresas com lucro)
  const peBySector = new Map<string, number[]>();
  for (const s of stocks) {
    const p = pe(s.metrics);
    if (p !== undefined) peBySector.set(s.sector, [...(peBySector.get(s.sector) ?? []), p]);
  }
  const sectorPe = new Map([...peBySector].map(([k, v]) => [k, median(v)!]));
  const ctxOf = (s: StockInput): Ctx => ({ sectorPeMedian: sectorPe.get(s.sector) });

  const allPillars = [...QUALITY_PILLARS, ...VALUATION_PILLARS];
  const pctFns = new Map<string, (x: number) => number>();
  for (const pillar of allPillars) {
    for (const ind of pillar.indicators) {
      const vals = stocks.map((s) => ind.value(s.metrics, ctxOf(s))).filter((v): v is number => v !== undefined);
      pctFns.set(ind.key, percentileFn(vals, ind.direction));
    }
  }

  const evalPillars = (s: StockInput, defs: PillarDef[]) =>
    defs.map((p): PillarResult => {
      const indicators = p.indicators.map((ind) => {
        const v = ind.value(s.metrics, ctxOf(s));
        return {
          key: ind.key,
          label: ind.label,
          unit: ind.unit,
          value: v ?? null,
          percentile: v !== undefined ? Math.round(pctFns.get(ind.key)!(v)) : null,
        };
      });
      const ps = indicators.map((i) => i.percentile).filter((x): x is number => x !== null);
      return {
        key: p.key,
        label: p.label,
        weight: p.weight,
        score: ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null,
        indicators,
      };
    });
  const combine = (pillars: PillarResult[]) => {
    const ok = pillars.filter((p) => p.score !== null);
    if (ok.length < 2) return null;
    const w = ok.reduce((s, p) => s + p.weight, 0);
    return Math.round(ok.reduce((s, p) => s + p.score! * p.weight, 0) / w);
  };

  const partial = stocks.map((s) => {
    const qualityPillars = evalPillars(s, QUALITY_PILLARS);
    const valuationPillars = evalPillars(s, VALUATION_PILLARS);
    return { s, qualityPillars, valuationPillars, quality: combine(qualityPillars), valuation: combine(valuationPillars) };
  });

  const topPct = (vals: (number | null)[]) => {
    const ok = vals.filter((v): v is number => v !== null);
    return (v: number | null) => (v === null ? null : Math.max(1, Math.round((ok.filter((x) => x > v).length / ok.length) * 100) + 1));
  };
  const qTop = topPct(partial.map((p) => p.quality));
  const vTop = topPct(partial.map((p) => p.valuation));

  return partial.map(({ s, qualityPillars, valuationPillars, quality, valuation }) => {
    const m = s.metrics;
    const style: StockScore["style"] =
      s.sector === "Real Estate" ? "REIT" : (m.revenueGrowth3Y ?? 0) >= 10 ? "Growth" : "Value";
    const pillarScore = (arr: PillarResult[], key: string) => arr.find((p) => p.key === key)?.score ?? null;
    const tags: string[] = [];
    if ((pillarScore(qualityPillars, "growth") ?? 0) >= 80) tags.push("Crescimento forte");
    if ((pillarScore(qualityPillars, "profitability") ?? 0) >= 80) tags.push("Muito rentável");
    if ((pillarScore(qualityPillars, "balance") ?? 0) >= 80) tags.push("Balanço sólido");
    if ((valuation ?? 0) >= 60) tags.push("Valuation atrativo");
    if ((pillarScore(qualityPillars, "balance") ?? 100) < 20) tags.push("Balanço frágil");
    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      industry: s.industry,
      style,
      quality,
      valuation,
      qualityLabel: qualityLabel(quality),
      valuationLabel: valuationLabel(valuation),
      qualityTopPct: qTop(quality),
      valuationTopPct: vTop(valuation),
      reading: readingFor(quality, valuation),
      tags,
      marketCap: m.marketCapitalization ?? null,
      qualityPillars,
      valuationPillars,
      sectorPeMedian: sectorPe.get(s.sector) ?? null,
    };
  });
}
