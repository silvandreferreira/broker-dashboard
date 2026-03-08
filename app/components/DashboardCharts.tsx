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

type Summary = {
  totalUnits: number;
  totalInvested: number;
  totalAcc: number;
  totalEuros: number;
  profitPercent: number;
};

type DashboardData = {
  summary: Summary | null;
  byCategory: { name: string; value: number; current: number }[];
  byYear: { year: number; profitPercent: number; invested: number; profit: number }[];
  byType: { type: string; value: number; percentage: number }[];
  investedVsProfitByYear: { year: string; investido: number; lucro: number }[];
  investedAndAccByYear: { year: string; investidoAcumulado: number; acc: number }[];
  byTicker: { ticker: string; units: number; invested: number; current: number }[];
  byIndexGroup: { name: string; value: number; current: number }[];
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export function DashboardCharts({ fileId }: { fileId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard?fileId=${encodeURIComponent(fileId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar dashboard");
        return res.json();
      })
      .then((d: DashboardData) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        A carregar dashboard...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
    <div className="space-y-8">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Total Unidades</p>
            <p className="text-lg font-semibold">{summary.totalUnits.toFixed(4)}</p>
          </div>
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Total Investido</p>
            <p className="text-lg font-semibold">{formatEur(summary.totalInvested)}</p>
          </div>
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Total ACC</p>
            <p className="text-lg font-semibold">{formatEur(summary.totalAcc)}</p>
          </div>
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Total €€</p>
            <p className="text-lg font-semibold">{formatEur(summary.totalEuros)}</p>
          </div>
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Profit %</p>
            <p className={`text-lg font-semibold ${summary.profitPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatPct(summary.profitPercent)}
            </p>
          </div>
        </div>
      )}

      {byIndexGroup.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Percentagem por índice (ETFs agrupados)</h3>
          <p className="mb-2 text-xs text-gray-500">
            ETFs que replicam o mesmo índice (ex.: SXR8 + VUAA → S&P 500) estão agrupados. O mapeamento está em <code className="rounded bg-gray-100 px-1">lib/etfIndexGroups.ts</code>.
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
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {byYear.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">b. % de profit por ano</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byYear.map((d) => ({ ...d, year: String(d.year), profitPct: d.profitPercent }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Profit %"]} />
              <Bar dataKey="profitPct" fill="#3b82f6" name="Profit %" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {byType.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">c. Tipo de investimento (ETFs, Ações, etc.)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={byType}
                dataKey="percentage"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ type, percentage }) => `${type} ${percentage.toFixed(0)}%`}
              >
                {byType.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            </PieChart>
          </ResponsiveContainer>
          <p className="mt-1 text-xs text-gray-500">
            Emergency fund (euros não investidos) não está no export XTB; podes contabilizá-lo à parte.
          </p>
        </div>
      )}

      {investedVsProfitByYear.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">d. Investido vs lucro por ano</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={investedVsProfitByYear}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `€${v}`} />
              <Tooltip formatter={(v: number) => [formatEur(v), ""]} />
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
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">e. Investido acumulado vs ACC (dinheiro meu vs juros compostos)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={investedAndAccByYear}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `€${v}`} />
              <Tooltip formatter={(v: number) => [formatEur(v), ""]} />
              <Legend />
              <Line type="monotone" dataKey="investidoAcumulado" stroke="#6366f1" name="Investido acumulado" strokeWidth={2} dot />
              <Line type="monotone" dataKey="acc" stroke="#10b981" name="ACC (valor atual)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {byTicker.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">f. Unidades por ticker</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byTicker} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => v.toFixed(2)} />
              <YAxis type="category" dataKey="ticker" width={56} />
              <Tooltip formatter={(v: number) => [v.toFixed(4), "Unidades"]} />
              <Bar dataKey="units" fill="#0ea5e9" name="Unidades" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!summary && byIndexGroup.length === 0 && byYear.length === 0 && (
        <p className="text-sm text-gray-500">Sem dados para o ficheiro selecionado.</p>
      )}
    </div>
  );
}
