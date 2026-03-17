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
  LineChart,
  Line,
} from "recharts";
import { useCache, type DashboardData } from "../contexts/CacheContext";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export function DashboardCharts({ fileId }: { fileId: string }) {
  const { getDashboardData, loadDashboard } = useCache();
  const data = getDashboardData(fileId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data != null) {
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDashboard(fileId)
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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
  if (error) {
    return (
      <div className="alert alert-danger py-2 small mb-0">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const { summary, byYear, byType, investedVsProfitByYear, investedAndAccByYear, byTicker, byIndexGroup } = data;

  const formatEur = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const formatPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

  return (
    <div className="d-flex flex-column gap-4">
      {summary && (
        <div className="row row-cols-2 row-cols-sm-5 g-3">
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Total Unidades</p>
              <p className="fw-semibold mb-0">{summary.totalUnits.toFixed(2)}</p>
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
          <h3 className="h6 mb-3">b. % de profit por ano</h3>
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

      {byType.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-3">c. Tipo de investimento (ETFs, Ações, etc.)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={byType}
                dataKey="percentage"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, value }) =>
                  `${name ?? ""} ${typeof value === "number" ? value.toFixed(0) : ""}%`
                }
              >
                {byType.map((_, i) => (
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
          <p className="small text-muted mt-1 mb-0">
            Emergency fund (euros não investidos) não está no export XTB; podes contabilizá-lo à parte.
          </p>
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

      {investedAndAccByYear.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-3">e. Investido acumulado vs ACC (dinheiro meu vs juros compostos)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={investedAndAccByYear}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `€${v}`} />
              <Tooltip
                formatter={(v) => [typeof v === "number" ? formatEur(v) : `${v ?? ""}`, ""]}
              />
              <Legend />
              <Line type="monotone" dataKey="investidoAcumulado" stroke="#6366f1" name="Investido acumulado" strokeWidth={2} dot />
              <Line type="monotone" dataKey="acc" stroke="#10b981" name="ACC (valor atual)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {byTicker.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-3">f. Unidades por ticker</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byTicker} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => v.toFixed(2)} />
              <YAxis type="category" dataKey="ticker" width={56} />
              <Tooltip
                formatter={(v) => [
                  typeof v === "number" ? v.toFixed(4) : `${v ?? ""}`,
                  "Unidades",
                ]}
              />
              <Bar dataKey="units" fill="#0ea5e9" name="Unidades" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!summary && byIndexGroup.length === 0 && byYear.length === 0 && (
        <p className="small text-muted mb-0">Sem dados para o ficheiro selecionado.</p>
      )}
    </div>
  );
}
