"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scoreClass, STYLE_BADGE } from "./stockUi";

// Mesma paleta validada dos gráficos da carteira (dataviz): série 1 sólida, série 2 tracejada.
const SERIES_1 = "#059669";
const SERIES_2 = "#6366f1";
const POSITIVE = "#3b82f6";
const NEGATIVE = "#ef4444";

type SeriesPoint = { period: string; v: number };
type Indicator = { key: string; label: string; value: number | null; unit?: string; percentile: number | null };
type Pillar = { key: string; label: string; weight: number; score: number | null; indicators: Indicator[] };
type Score = {
  symbol: string;
  name: string;
  sector: string;
  industry: string | null;
  style: "Growth" | "Value" | "REIT";
  quality: number | null;
  valuation: number | null;
  qualityLabel: string;
  valuationLabel: string;
  qualityTopPct: number | null;
  valuationTopPct: number | null;
  reading: string;
  tags: string[];
  marketCap: number | null;
  qualityPillars: Pillar[];
  valuationPillars: Pillar[];
  sectorPeMedian: number | null;
};
type Detail = {
  profile: { country?: string; exchange?: string; logo?: string; weburl?: string; currency?: string };
  recommendations: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[];
  earnings: { period: string; quarter: number; year: number; actual: number | null; estimate: number | null; surprisePercent: number | null }[];
  insider: {
    purchases: number;
    sales: number;
    other: number;
    transactions: { name: string; change: number; transactionDate: string; filingDate: string; transactionCode: string; transactionPrice: number }[];
  };
  momentum: { label: string; stock: number | null; sp500: number | null }[];
  price: number | null;
  errors: string[];
};
type StockResponse = {
  score: Score;
  metrics: Record<string, number>;
  series: { annual: Record<string, SeriesPoint[]>; quarterly: Record<string, SeriesPoint[]> } | null;
  fundamentalsAt: string;
  detail: Detail;
  detailAt: string;
};

const nf = (n: number, d = 1) => n.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtValue = (v: number | null | undefined, unit?: string, d = 1) =>
  v === null || v === undefined ? "—" : unit === "%" ? `${nf(v, d)}%` : unit === "x" ? `${nf(v, d)}x` : nf(v, d);
const fmtSigned = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${nf(v)}%`);
const fmtCap = (millions: number | null) =>
  millions === null
    ? "—"
    : millions >= 1e6
      ? `$${nf(millions / 1e6, 2)} B`
      : millions >= 1e3
        ? `$${nf(millions / 1e3, 1)} mM`
        : `$${nf(millions, 0)} M`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

/** As séries do Finnhub trazem margens em fração (0,64) e as métricas TTM em % (64): normalizar para %. */
const asPct = (points: SeriesPoint[] | undefined) =>
  (points ?? []).map((p) => ({ ...p, v: Math.abs(p.v) <= 2 ? p.v * 100 : p.v }));

function ScoreRing({ value, label }: { value: number | null; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  const color = value === null ? "#9ca3af" : value >= 60 ? SERIES_1 : value >= 40 ? "#6b7280" : NEGATIVE;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label={`${label}: ${value ?? "sem dados"} de 100`}>
      <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle
        cx="65"
        cy="65"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 65 65)"
      />
      <text x="65" y="68" textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor">
        {value ?? "—"}
      </text>
      <text x="65" y="88" textAnchor="middle" fontSize="11" fill="#6b7280">
        de 100
      </text>
    </svg>
  );
}

function PillarsCard({
  title,
  score,
  label,
  topPct,
  topText,
  pillars,
}: {
  title: string;
  score: number | null;
  label: string;
  topPct: number | null;
  topText: string;
  pillars: Pillar[];
}) {
  return (
    <div className="card border shadow-sm h-100">
      <div className="card-body">
        <h3 className="h6 text-uppercase text-muted mb-3">{title}</h3>
        <div className="row g-3 align-items-start">
          <div className="col-12 col-sm-4 text-center">
            <ScoreRing value={score} label={title} />
            <div className={`fw-bold ${scoreClass(score)}`}>{label}</div>
            {topPct !== null && <span className="badge text-bg-light border mt-1">Top {topPct}% {topText}</span>}
          </div>
          <div className="col-12 col-sm-8">
            {pillars.map((p) => (
              <div key={p.key} className="mb-3">
                <div className="d-flex justify-content-between small">
                  <span className="fw-semibold">
                    {p.label} <span className="text-muted fw-normal">({p.weight}%)</span>
                  </span>
                  <span className={scoreClass(p.score)}>{p.score ?? "—"}</span>
                </div>
                <div className="progress my-1" style={{ height: 6 }} role="progressbar" aria-valuenow={p.score ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={p.label}>
                  <div className="progress-bar bg-success" style={{ width: `${p.score ?? 0}%` }} />
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {p.indicators.map((i) => (
                    <span key={i.key} className="border rounded px-2 py-1 small bg-body-tertiary" title={i.percentile !== null ? `Percentil ${i.percentile} no S&P 500` : "Sem dados"}>
                      <span className="text-muted">{i.label}: </span>
                      <strong>{fmtValue(i.value, i.unit)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card border shadow-sm h-100">
      <div className="card-body">
        <h4 className="h6 mb-0">{title}</h4>
        {subtitle && <p className="small text-muted mb-2">{subtitle}</p>}
        <div style={{ width: "100%", height: 240 }}>{children}</div>
      </div>
    </div>
  );
}

export function StockDetailView({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const [data, setData] = useState<StockResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${encodeURIComponent(symbol)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: StockResponse) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Erro ao carregar a ação."));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const charts = useMemo(() => {
    const s = data?.series?.[period] ?? {};
    const label = (p: string) => (period === "annual" ? p.slice(0, 4) : `${p.slice(2, 4)}/${p.slice(5, 7)}`);
    const byPeriod = new Map<string, Record<string, number | string>>();
    const put = (key: string, pts: SeriesPoint[]) => {
      for (const p of pts) {
        const row = byPeriod.get(p.period) ?? { period: p.period, label: label(p.period) };
        row[key] = Math.round(p.v * 100) / 100;
        byPeriod.set(p.period, row);
      }
    };
    put("grossMargin", asPct(s.grossMargin));
    put("netMargin", asPct(s.netMargin));
    put("eps", s.eps ?? []);
    put("pe", s.pe ?? []);
    put("pb", s.pb ?? []);
    put("fcfMargin", asPct(s.fcfMargin));
    const rows = [...byPeriod.values()].sort((a, b) => String(a.period).localeCompare(String(b.period)));
    return period === "annual" ? rows.slice(-8) : rows.slice(-12);
  }, [data, period]);

  const back = (
    <button type="button" className="btn btn-link btn-sm px-0 mb-2" onClick={onBack}>
      <i className="bi bi-arrow-left me-1" />
      Voltar ao radar
    </button>
  );
  if (error)
    return (
      <div>
        {back}
        <div className="alert alert-warning">{error}</div>
      </div>
    );
  if (!data)
    return (
      <div>
        {back}
        <div className="d-flex align-items-center text-secondary py-4">
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />A carregar {symbol}...
        </div>
      </div>
    );

  const { score, metrics, detail } = data;
  const rec = detail.recommendations[0];
  const recBuy = rec ? rec.strongBuy + rec.buy : 0;
  const recHold = rec ? rec.hold : 0;
  const recSell = rec ? rec.sell + rec.strongSell : 0;
  const recTotal = recBuy + recHold + recSell;
  const consensus = !rec || recTotal === 0 ? "—" : recBuy >= recTotal / 2 ? "Comprar" : recSell >= recTotal / 3 ? "Vender" : "Manter";
  const hasHistory = charts.length > 1;

  const ratios: [string, number | undefined, string?][] = [
    ["P/E", metrics.peTTM, "x"],
    ["P/E forward", metrics.forwardPE, "x"],
    ["P/B", metrics.pbQuarterly ?? metrics.pbAnnual, "x"],
    ["P/S", metrics.psTTM, "x"],
    ["EV/EBITDA", metrics.evEbitdaTTM, "x"],
    ["P/FCF", metrics.pfcfShareTTM, "x"],
    ["M. bruta", metrics.grossMarginTTM, "%"],
    ["M. líquida", metrics.netProfitMarginTTM, "%"],
    ["ROIC", metrics.roiTTM, "%"],
    ["ROE", metrics.roeTTM, "%"],
    ["Div. yield", metrics.currentDividendYieldTTM ?? metrics.dividendYieldIndicatedAnnual, "%"],
    ["Payout", metrics.payoutRatioTTM, "%"],
    ["Dívida/Capital", metrics["totalDebt/totalEquityQuarterly"], "x"],
    ["Beta", metrics.beta, ""],
  ];

  return (
    <div>
      {back}

      {/* Cabeçalho */}
      <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
        {detail.profile.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={detail.profile.logo} alt="" width={48} height={48} className="rounded border bg-white" />
        )}
        <div>
          <div className="d-flex align-items-center gap-2">
            <h2 className="h4 mb-0">{score.symbol}</h2>
            <span className={`badge ${STYLE_BADGE[score.style]}`}>{score.style}</span>
          </div>
          <div className="text-muted small">
            {score.name} · {score.sector}
            {score.industry ? ` · ${score.industry}` : ""}
          </div>
        </div>
      </div>
      {score.tags.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-3">
          {score.tags.map((t) => (
            <span key={t} className={`badge ${t === "Balanço frágil" ? "text-bg-danger" : "text-bg-light border"}`}>
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="row g-2 mb-3 small">
        {[
          ["País", detail.profile.country ?? "—"],
          ["Bolsa", detail.profile.exchange ?? "—"],
          ["Market cap", fmtCap(score.marketCap)],
          ["Preço", detail.price !== null ? `$${nf(detail.price, 2)}` : "—"],
          ["Máx. / mín. 52 sem.", metrics["52WeekHigh"] ? `$${nf(metrics["52WeekHigh"], 2)} / $${nf(metrics["52WeekLow"] ?? 0, 2)}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="col-6 col-md">
            <div className="border rounded p-2 h-100">
              <div className="text-uppercase text-muted" style={{ fontSize: "0.7rem" }}>
                {k}
              </div>
              <div className="fw-semibold">{v}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="alert alert-light border small">
        <strong>Leitura:</strong> {score.reading}
      </div>

      {/* Notas */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-6">
          <PillarsCard
            title="Qualidade"
            score={score.quality}
            label={score.qualityLabel}
            topPct={score.qualityTopPct}
            topText="melhor qualidade"
            pillars={score.qualityPillars}
          />
        </div>
        <div className="col-12 col-xl-6">
          <PillarsCard
            title="Valuation"
            score={score.valuation}
            label={score.valuationLabel}
            topPct={score.valuationTopPct}
            topText="mais barata"
            pillars={score.valuationPillars}
          />
          {score.sectorPeMedian !== null && (
            <p className="small text-muted mt-1 mb-0">
              P/E mediano do setor {score.sector} no S&amp;P 500: {nf(score.sectorPeMedian)}x · P/E mediano de 5 anos
              da empresa: {fmtValue(metrics._peMedian5y, "x")}.
            </p>
          )}
        </div>
      </div>

      {/* Momentum */}
      <h3 className="h6 text-uppercase text-muted">Momentum vs S&amp;P 500</h3>
      {detail.momentum.length ? (
        <div className="row g-2 mb-4">
          {detail.momentum.map((m) => (
            <div key={m.label} className="col-6 col-md-3">
              <div className="border rounded p-2 text-center h-100">
                <div className="small text-muted">{m.label}</div>
                <div className={`fs-5 fw-bold ${m.stock === null ? "" : m.stock >= 0 ? "text-success" : "text-danger"}`}>
                  {fmtSigned(m.stock)}
                </div>
                <div className="small text-muted">S&amp;P 500: {fmtSigned(m.sp500)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="small text-muted mb-4">Sem cotações disponíveis.</p>
      )}

      {/* Analistas */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-6">
          <div className="card border shadow-sm h-100">
            <div className="card-body">
              <h3 className="h6 text-uppercase text-muted">Consenso dos analistas</h3>
              {rec ? (
                <>
                  {[
                    ["Comprar", recBuy, "bg-success"],
                    ["Manter", recHold, "bg-secondary"],
                    ["Vender", recSell, "bg-danger"],
                  ].map(([label, n, cls]) => (
                    <div key={label as string} className="d-flex align-items-center gap-2 small mb-1">
                      <span style={{ width: 70 }}>{label}</span>
                      <div className="progress flex-grow-1" style={{ height: 8 }} role="progressbar" aria-label={label as string} aria-valuenow={n as number} aria-valuemin={0} aria-valuemax={recTotal}>
                        <div className={`progress-bar ${cls}`} style={{ width: `${recTotal ? ((n as number) / recTotal) * 100 : 0}%` }} />
                      </div>
                      <span className="text-end" style={{ width: 30 }}>
                        {n as number}
                      </span>
                    </div>
                  ))}
                  <div className="d-flex justify-content-between small mt-2">
                    <span>
                      Consenso: <strong>{consensus}</strong>
                    </span>
                    <span className="text-muted">
                      {recTotal} analistas · {rec.period.slice(0, 7)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="small text-muted mb-0">Sem recomendações.</p>
              )}
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card border shadow-sm h-100">
            <div className="card-body">
              <h3 className="h6 text-uppercase text-muted">Resultados (EPS real vs estimado)</h3>
              {detail.earnings.length ? (
                <table className="table table-sm small mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Trimestre</th>
                      <th scope="col" className="text-end">Real</th>
                      <th scope="col" className="text-end">Estimado</th>
                      <th scope="col" className="text-end">Surpresa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.earnings.map((e) => {
                      const beat = e.actual !== null && e.estimate !== null ? e.actual >= e.estimate : null;
                      return (
                        <tr key={e.period}>
                          <td>
                            T{e.quarter} {e.year}
                          </td>
                          <td className="text-end">{e.actual !== null ? `$${nf(e.actual, 2)}` : "—"}</td>
                          <td className="text-end">{e.estimate !== null ? `$${nf(e.estimate, 2)}` : "—"}</td>
                          <td className="text-end">
                            {beat !== null && (
                              <span className={`badge ${beat ? "text-bg-success" : "text-bg-danger"} me-1`}>
                                {beat ? "Bateu" : "Falhou"}
                              </span>
                            )}
                            {e.surprisePercent !== null ? fmtSigned(e.surprisePercent) : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="small text-muted mb-0">Sem resultados.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Evolução financeira */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h3 className="h6 text-uppercase text-muted mb-0">Evolução financeira</h3>
        <div className="btn-group btn-group-sm" role="group" aria-label="Período">
          <button type="button" className={`btn ${period === "annual" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setPeriod("annual")}>
            Anual
          </button>
          <button type="button" className={`btn ${period === "quarterly" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setPeriod("quarterly")}>
            Trimestral
          </button>
        </div>
      </div>
      {hasHistory ? (
        <div className="row g-3 mb-4">
          <div className="col-12 col-lg-6">
            <ChartCard title="Margem bruta e líquida" subtitle="Em % da receita">
              <ResponsiveContainer>
                <LineChart data={charts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" width={48} />
                  <Tooltip formatter={(v) => `${nf(Number(v))}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="grossMargin" name="M. bruta" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  <Line type="monotone" dataKey="netMargin" name="M. líquida" stroke={SERIES_2} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div className="col-12 col-lg-6">
            <ChartCard title="Lucro por ação (EPS)" subtitle={period === "annual" ? "Por ano, em USD" : "Por trimestre, em USD"}>
              <ResponsiveContainer>
                <BarChart data={charts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={(v) => `$${nf(Number(v), 2)}`} />
                  <ReferenceLine y={0} stroke="#9ca3af" />
                  <Bar dataKey="eps" name="EPS" radius={[4, 4, 0, 0]}>
                    {charts.map((d) => (
                      <Cell key={String(d.period)} fill={Number(d.eps ?? 0) >= 0 ? POSITIVE : NEGATIVE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div className="col-12 col-lg-6">
            <ChartCard title="P/E" subtitle="Preço ÷ lucro por ação">
              <ResponsiveContainer>
                <LineChart data={charts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={(v) => `${nf(Number(v))}x`} />
                  <Line type="monotone" dataKey="pe" name="P/E" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div className="col-12 col-lg-6">
            <ChartCard title="P/B (preço / valor contabilístico)" subtitle="Preço ÷ capital próprio por ação">
              <ResponsiveContainer>
                <LineChart data={charts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={(v) => `${nf(Number(v))}x`} />
                  <Line type="monotone" dataKey="pb" name="P/B" stroke={SERIES_2} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      ) : (
        <p className="small text-muted mb-4">Sem histórico financeiro.</p>
      )}

      {/* Rácios */}
      <h3 className="h6 text-uppercase text-muted">Rácios financeiros (últimos 12 meses)</h3>
      <div className="row g-2 mb-4">
        {ratios.map(([label, v, unit]) => (
          <div key={label} className="col-6 col-md-3 col-xl-2">
            <div className="border rounded p-2 h-100">
              <div className="text-uppercase text-muted" style={{ fontSize: "0.7rem" }}>
                {label}
              </div>
              <div className="fw-semibold">{fmtValue(v, unit)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Insiders */}
      <h3 className="h6 text-uppercase text-muted">Insider trading (últimos 12 meses)</h3>
      <div className="d-flex gap-4 small mb-2">
        <span>
          <strong className="text-success">{detail.insider.purchases}</strong> compras
        </span>
        <span>
          <strong className="text-danger">{detail.insider.sales}</strong> vendas
        </span>
        <span>
          <strong>{detail.insider.other}</strong> outras operações
        </span>
      </div>
      {detail.insider.transactions.length > 0 ? (
        <div className="table-responsive mb-4">
          <table className="table table-sm small">
            <thead>
              <tr>
                <th scope="col">Insider</th>
                <th scope="col">Operação</th>
                <th scope="col">Data</th>
                <th scope="col" className="text-end">Ações</th>
                <th scope="col" className="text-end">Preço</th>
              </tr>
            </thead>
            <tbody>
              {detail.insider.transactions.map((t, i) => (
                <tr key={`${t.name}-${t.transactionDate}-${i}`}>
                  <td>{t.name}</td>
                  <td>
                    <span className={`badge ${t.transactionCode === "P" ? "text-bg-success" : "text-bg-danger"}`}>
                      {t.transactionCode === "P" ? "Compra" : "Venda"}
                    </span>
                  </td>
                  <td>
                    {fmtDate(t.transactionDate)}
                    <div className="text-muted">declarada a {fmtDate(t.filingDate)}</div>
                  </td>
                  <td className="text-end">{Math.abs(t.change).toLocaleString("pt-PT")}</td>
                  <td className="text-end">{t.transactionPrice ? `$${nf(t.transactionPrice, 2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small text-muted mb-4">Sem compras ou vendas de insiders.</p>
      )}

      <p className="small text-muted mb-0">
        Fundamentais de {fmtDate(data.fundamentalsAt)} · analistas, resultados e insiders de {fmtDate(data.detailAt)} ·
        fonte Finnhub (cotações Yahoo Finance).
        {detail.errors.length > 0 && ` Não foi possível obter: ${detail.errors.join(", ")}.`}
      </p>
    </div>
  );
}
