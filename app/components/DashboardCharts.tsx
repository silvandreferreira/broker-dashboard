"use client";

import { useEffect, useState } from "react";
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
import { useCache } from "../contexts/CacheContext";
import { HistoryCharts } from "./HistoryCharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export function DashboardCharts({ fileId }: { fileId: string }) {
  const { getDashboardData, loadDashboard } = useCache();
  const data = getDashboardData(fileId);
  const [error, setError] = useState<{ fileId: string; message: string } | null>(null);
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

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5 text-secondary">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        A carregar dashboard...
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

  const formatEur = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const formatEur2 = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  const formatUnits = (n: number) =>
    new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 }).format(n);
  const formatPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

  return (
    <div className="d-flex flex-column gap-4">
      {summary && (
        <div className="row row-cols-2 row-cols-sm-5 g-3">
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">N.º de ETFs</p>
              <p className="fw-semibold mb-0">{summary.etfCount}</p>
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
          <h3 className="h6 mb-3">f. Unidades por ETF</h3>
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-0">
              <thead>
                <tr>
                  <th>ETF</th>
                  <th className="text-end">Unidades</th>
                  <th className="text-end">Investido</th>
                  <th className="text-end">Valor</th>
                  <th className="text-end">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {byTicker.map((t) => {
                  const profit = t.current - t.invested;
                  const pct = t.invested > 0 ? (profit / t.invested) * 100 : 0;
                  return (
                    <tr key={t.ticker}>
                      <td>
                        <div className="fw-medium">{t.name ?? t.ticker}</div>
                        <div className="text-muted">{t.ticker}</div>
                      </td>
                      <td className="text-end">{formatUnits(t.units)}</td>
                      <td className="text-end">{formatEur2(t.invested)}</td>
                      <td className="text-end">{formatEur2(t.current)}</td>
                      <td className={`text-end ${profit >= 0 ? "text-success" : "text-danger"}`}>
                        {formatEur2(profit)}
                        <div className="small">{formatPct(pct)}</div>
                      </td>
                    </tr>
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
