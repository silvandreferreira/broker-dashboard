"use client";

import { Fragment, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useCache, type BrokerFilter, type KindFilter } from "../contexts/CacheContext";
import { HistoryCharts } from "./HistoryCharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

const BROKER_LABEL: Record<string, string> = { XTB: "XTB", T212: "Trading 212" };
const BROKER_OPTIONS: { value: BrokerFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "XTB", label: "XTB" },
  { value: "T212", label: "Trading 212" },
];
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "ETF", label: "ETFs" },
  { value: "STOCK", label: "Ações" },
];

export function DashboardCharts({ fileId }: { fileId: string }) {
  const { getDashboardData, loadDashboard, includePlans, setIncludePlans, broker, setBroker, kind, setKind } = useCache();
  const data = getDashboardData(fileId);
  const [error, setError] = useState<{ fileId: string; message: string } | null>(null);
  /** Tickers com as sublinhas (uma por compra) abertas */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (ticker: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  const currentError = error?.fileId === fileId ? error.message : null;
  const loading = data == null && currentError == null;

  useEffect(() => {
    if (data != null) return;
    let cancelled = false;
    loadDashboard(fileId).catch((e) => {
      if (!cancelled) {
        setError({ fileId, message: e instanceof Error ? e.message : "Falha ao carregar dashboard" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, data, loadDashboard]);

  const planToggle = (
    <div className="d-flex flex-wrap align-items-center gap-3">
      <div className="btn-group btn-group-sm" role="group" aria-label="Corretora">
        {BROKER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`btn ${broker === o.value ? "btn-primary" : "btn-outline-primary"}`}
            aria-pressed={broker === o.value}
            onClick={() => setBroker(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="btn-group btn-group-sm" role="group" aria-label="Tipo de ativo">
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`btn ${kind === o.value ? "btn-secondary" : "btn-outline-secondary"}`}
            aria-pressed={kind === o.value}
            onClick={() => setKind(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="form-check form-switch mb-0">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          id="include-plans"
          checked={includePlans}
          onChange={(e) => setIncludePlans(e.target.checked)}
        />
        <label className="form-check-label small" htmlFor="include-plans">
          Incluir planos de investimento
        </label>
      </div>
      {data?.hasInvestmentPlans === false && (
        <span className="small text-muted">
          (este ficheiro não tem posições de planos de investimento)
        </span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="d-flex flex-column gap-3">
        {planToggle}
        <div className="d-flex align-items-center justify-content-center py-5 text-secondary">
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          A carregar dashboard...
        </div>
      </div>
    );
  }
  if (currentError) {
    return (
      <div className="alert alert-danger py-2 small mb-0">
        {currentError}
      </div>
    );
  }
  if (!data) return null;

  const { summary, byYear, investedVsProfitByYear, byTicker, byIndexGroup } = data;
  const byBroker = data.byBroker ?? [];

  const formatEur = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const formatEur2 = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  const formatUnits = (n: number) =>
    new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 }).format(n);
  const formatPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

  return (
    <div className="d-flex flex-column gap-4">
      {planToggle}

      {summary && (
        <div className="row row-cols-2 row-cols-sm-3 row-cols-lg-6 g-3">
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">N.º de ativos</p>
              <p className="fw-semibold mb-0">{summary.etfCount}</p>
              {summary.etfOnlyCount != null && summary.stockCount != null && (
                <div className="small text-muted lh-sm mt-1">
                  <div>{summary.etfOnlyCount} {summary.etfOnlyCount === 1 ? "ETF" : "ETFs"}</div>
                  <div>
                    {summary.stockCount} {summary.stockCount === 1 ? "ação" : "ações"}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Total de unidades</p>
              <p className="fw-semibold mb-0">{formatUnits(summary.totalUnits)}</p>
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Total Investido</p>
              <p className="fw-semibold mb-0">{formatEur(summary.totalInvested)}</p>
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Total ACC</p>
              <p className="fw-semibold mb-0">{formatEur(summary.totalAcc)}</p>
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Total €€</p>
              <p className="fw-semibold mb-0">{formatEur(summary.totalEuros)}</p>
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Profit %</p>
              <p className={`fw-semibold mb-0 ${summary.profitPercent >= 0 ? "text-success" : "text-danger"}`}>
                {formatPct(summary.profitPercent)}
              </p>
            </div>
          </div>
        </div>
      )}

      {byBroker.length > 1 && (
        <div className="row g-3">
          {byBroker.map((b) => (
            <div key={b.broker} className="col-12 col-md-6">
              <div className="rounded border bg-white p-3 h-100">
                <div className="d-flex justify-content-between align-items-baseline mb-2">
                  <h3 className="h6 mb-0">{BROKER_LABEL[b.broker] ?? b.broker}</h3>
                  <span className="small text-muted">
                    {b.weight.toFixed(0)}% da carteira · {b.positions} {b.positions === 1 ? "ativo" : "ativos"}
                  </span>
                </div>
                <div className="progress mb-2" style={{ height: 6 }} role="progressbar" aria-label={`Peso da ${BROKER_LABEL[b.broker] ?? b.broker}`} aria-valuenow={b.weight} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-bar" style={{ width: `${b.weight}%` }} />
                </div>
                <div className="d-flex justify-content-between small">
                  <div>
                    <div className="text-muted">Investido</div>
                    <div className="fw-semibold">{formatEur(b.invested)}</div>
                  </div>
                  <div>
                    <div className="text-muted">Valor</div>
                    <div className="fw-semibold">{formatEur(b.current)}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-muted">Lucro</div>
                    <div className={`fw-semibold ${b.profit >= 0 ? "text-success" : "text-danger"}`}>
                      {formatEur(b.profit)} ({formatPct(b.profitPercent)})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary && <HistoryCharts fileId={fileId} />}

      {byIndexGroup.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-3">Percentagem por índice (ETFs agrupados)</h3>
          <p className="small text-muted mb-2">
            ETFs que replicam o mesmo índice (ex.: SXR8 + VUAA → S&P 500) estão agrupados. O mapeamento está em <code className="rounded bg-light px-1">lib/etfIndexGroups.ts</code>.
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={byIndexGroup}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, value }) => `${name} ${value.toFixed(0)}%`}
              >
                {byIndexGroup.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) =>
                  typeof v === "number" ? `${v.toFixed(1)}%` : `${v ?? ""}`
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {byYear.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-1">b. % de lucro por ano de compra</h3>
          <p className="small text-muted mb-2">
            Quanto já rendeu, até hoje, o que compraste em cada ano. Para o rendimento da carteira em cada ano, vê o gráfico «Rendimento anual».
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byYear.map((d) => ({ ...d, year: String(d.year), profitPct: d.profitPercent }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v) => [
                  typeof v === "number" ? `${v.toFixed(1)}%` : `${v ?? ""}`,
                  "Profit %",
                ]}
              />
              <Bar dataKey="profitPct" fill="#3b82f6" name="Profit %" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {investedVsProfitByYear.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-3">d. Investido vs lucro por ano</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={investedVsProfitByYear}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `€${v}`} />
              <Tooltip
                formatter={(v) => [typeof v === "number" ? formatEur(v) : `${v ?? ""}`, ""]}
              />
              <Legend />
              <Bar dataKey="investido" fill="#6366f1" name="Investido" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lucro" name="Lucro" radius={[4, 4, 0, 0]}>
                {investedVsProfitByYear.map((d, i) => (
                  <Cell key={i} fill={d.lucro >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {byTicker.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-1">f. Unidades por ativo</h3>
          <p className="small text-muted mb-2">
            Toca num ativo para ver cada compra: data, corretora, preço pago por unidade e quanto estás a ganhar ou a
            perder nessa compra. Preço em € por unidade (inclui comissões de câmbio).
          </p>
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-0">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th className="text-end">Unidades</th>
                  <th className="text-end">Preço médio</th>
                  <th className="text-end">Investido</th>
                  <th className="text-end">Valor</th>
                  <th className="text-end">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {byTicker.map((t) => {
                  const profit = t.current - t.invested;
                  const pct = t.invested > 0 ? (profit / t.invested) * 100 : 0;
                  const lots = t.lots ?? [];
                  const isOpen = expanded.has(t.ticker);
                  return (
                    <Fragment key={t.ticker}>
                    <tr
                      onClick={lots.length ? () => toggleExpanded(t.ticker) : undefined}
                      style={lots.length ? { cursor: "pointer" } : undefined}
                    >
                      <td>
                        <div className="fw-medium d-flex align-items-center gap-1">
                          {lots.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-link btn-sm p-0 text-body"
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? "Esconder" : "Ver"} as ${lots.length} compras de ${t.ticker}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(t.ticker);
                              }}
                            >
                              <i className={`bi ${isOpen ? "bi-chevron-down" : "bi-chevron-right"}`} />
                            </button>
                          )}
                          {t.name ?? t.ticker}
                          {lots.length > 0 && (
                            <span className="text-muted fw-normal small">
                              · {lots.length} {lots.length === 1 ? "compra" : "compras"}
                            </span>
                          )}
                        </div>
                        <div className="text-muted d-flex flex-wrap align-items-center gap-1">
                          {t.ticker}
                          {t.category === "STOCK" && <span className="badge text-bg-primary">Ação</span>}
                          {(t.brokers ?? []).map((b) => (
                            <span key={b.broker} className="badge text-bg-light border">
                              {BROKER_LABEL[b.broker] ?? b.broker}
                            </span>
                          ))}
                        </div>
                        {(t.brokers?.length ?? 0) > 1 && (
                          <div className="text-muted">
                            {t.brokers!.map((b) => `${BROKER_LABEL[b.broker] ?? b.broker}: ${formatUnits(b.units)} un. · ${formatEur2(b.current)}`).join(" | ")}
                          </div>
                        )}
                      </td>
                      <td className="text-end">{formatUnits(t.units)}</td>
                      <td className="text-end">{t.units > 0 ? formatEur2(t.invested / t.units) : "—"}</td>
                      <td className="text-end">{formatEur2(t.invested)}</td>
                      <td className="text-end">{formatEur2(t.current)}</td>
                      <td className={`text-end ${profit >= 0 ? "text-success" : "text-danger"}`}>
                        {formatEur2(profit)}
                        <div className="small">{formatPct(pct)}</div>
                      </td>
                    </tr>
                    {isOpen &&
                      lots.map((l, i) => {
                        const lp = l.current - l.invested;
                        const lpct = l.invested > 0 ? (lp / l.invested) * 100 : 0;
                        return (
                          <tr key={`${t.ticker}-${i}`} className="table-light">
                            <td className="ps-4">
                              <i className="bi bi-arrow-return-right text-muted me-1" />
                              {l.openedAt ? new Date(l.openedAt).toLocaleDateString("pt-PT") : "Sem data"}
                              <span className="badge text-bg-light border ms-1">{BROKER_LABEL[l.broker] ?? l.broker}</span>
                              {l.product === "Investment Plan" && (
                                <span className="badge text-bg-light border ms-1">Plano</span>
                              )}
                            </td>
                            <td className="text-end">{formatUnits(l.units)}</td>
                            <td className="text-end">{l.units > 0 ? formatEur2(l.invested / l.units) : "—"}</td>
                            <td className="text-end">{formatEur2(l.invested)}</td>
                            <td className="text-end">{formatEur2(l.current)}</td>
                            <td className={`text-end ${lp >= 0 ? "text-success" : "text-danger"}`}>
                              {formatEur2(lp)}
                              <div className="small">{formatPct(lpct)}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.needsReupload && (
        <div className="alert alert-info py-2 small mb-0">
          Este ficheiro foi carregado com uma versão antiga da app (sem distinção entre ETFs e ações).
          Apaga-o e volta a carregá-lo para veres só os ETFs.
        </div>
      )}

      {!data.needsReupload && !summary && byIndexGroup.length === 0 && byYear.length === 0 && (
        <p className="small text-muted mb-0">Sem dados para o ficheiro selecionado.</p>
      )}
    </div>
  );
}
