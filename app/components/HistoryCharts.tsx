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
  LineChart,
  Line,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import { useCache, type HistoryPoint } from "../contexts/CacheContext";

// Validados (dataviz validate_palette): valor/investido passam CVD + contraste;
// investido é tracejado para não depender só da cor. Rendimento: divergente azul ↔ vermelho.
const VALUE_COLOR = "#059669";
const INVESTED_COLOR = "#6366f1";
const POSITIVE_COLOR = "#3b82f6";
const NEGATIVE_COLOR = "#ef4444";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;

const formatEur = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const formatEur2 = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
const formatPct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);

function ReturnTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: HistoryPoint & { label: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border bg-white p-2 small shadow-sm">
      <div className="fw-semibold">{p.label}</div>
      <div>Rendimento: {formatPct(p.returnPct)}</div>
      <div>Ganho: {formatEur2(p.gain)}</div>
      <div className="text-secondary">Aporte: {formatEur2(p.contribution)}</div>
    </div>
  );
}

function HistoryTable({ rows, firstCol }: { rows: (HistoryPoint & { label: string })[]; firstCol: string }) {
  return (
    <div className="table-responsive">
      <table className="table table-sm small mb-0">
        <thead>
          <tr>
            <th>{firstCol}</th>
            <th className="text-end">Valor</th>
            <th className="text-end">Investido</th>
            <th className="text-end">Aporte</th>
            <th className="text-end">Ganho</th>
            <th className="text-end">Rendimento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period}>
              <td>{r.label}</td>
              <td className="text-end">{formatEur2(r.value)}</td>
              <td className="text-end">{formatEur2(r.invested)}</td>
              <td className="text-end">{formatEur2(r.contribution)}</td>
              <td className={`text-end ${r.gain >= 0 ? "text-success" : "text-danger"}`}>{formatEur2(r.gain)}</td>
              <td className="text-end">{formatPct(r.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryCharts({ fileId }: { fileId: string }) {
  const { getHistoryData, loadHistory } = useCache();
  const data = getHistoryData(fileId);
  const [error, setError] = useState<{ fileId: string; message: string } | null>(null);
  const currentError = error?.fileId === fileId ? error.message : null;

  useEffect(() => {
    if (data != null) return;
    let cancelled = false;
    loadHistory(fileId).catch((e) => {
      if (!cancelled) {
        setError({ fileId, message: e instanceof Error ? e.message : "Falha ao carregar evolução" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, data, loadHistory]);

  if (currentError) {
    return <div className="alert alert-danger py-2 small mb-0">{currentError}</div>;
  }
  if (!data) {
    return (
      <div className="rounded border bg-white p-4 d-flex align-items-center text-secondary small">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        A calcular evolução com preços históricos (Yahoo Finance)...
      </div>
    );
  }
  if (data.needsReupload || data.error) {
    return <div className="alert alert-info py-2 small mb-0">{data.error}</div>;
  }

  const monthly = (data.monthly ?? []).map((p) => ({ ...p, label: monthLabel(p.period) }));
  const yearly = (data.yearly ?? []).map((p) => ({ ...p, label: p.period }));
  const last = monthly.at(-1) ?? yearly.at(-1);
  const asOf = data.asOf ? new Date(data.asOf).toLocaleDateString("pt-PT") : "";
  const diff = last && data.xtbValue ? last.value - data.xtbValue : null;
  const yearPoint = yearly.find((y) => y.period === String(data.year));

  return (
    <div className="d-flex flex-column gap-4">
      <div className="small text-muted">
        Valores estimados com preços de fecho do Yahoo Finance até {asOf}.
        {diff != null && (
          <>
            {" "}Valor estimado {formatEur2(last!.value)} vs XTB {formatEur2(data.xtbValue!)} (diferença{" "}
            {formatEur2(diff)}, {((diff / data.xtbValue!) * 100).toFixed(1)}%).
          </>
        )}{" "}
        Só incluem os lotes ainda abertos no relatório.
      </div>

      {data.failedTickers && data.failedTickers.length > 0 && (
        <div className="alert alert-warning py-2 small mb-0">
          <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
          Sem preços no Yahoo para: {data.failedTickers.join(", ")}. Estes ETFs ficam fora da evolução.
        </div>
      )}

      {yearPoint && (
        <div className="row row-cols-1 row-cols-sm-3 g-3">
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Ganho em {data.year}</p>
              <p className="fw-semibold mb-0">{formatEur(yearPoint.gain)}</p>
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Rendimento {data.year}</p>
              <p className="fw-semibold mb-0">{formatPct(yearPoint.returnPct)}</p>
            </div>
          </div>
          <div className="col">
            <div className="rounded border bg-light p-3">
              <p className="small fw-medium text-secondary mb-1">Aportes em {data.year}</p>
              <p className="fw-semibold mb-0">{formatEur(yearPoint.contribution)}</p>
            </div>
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-3">Evolução mensal {data.year}: valor da carteira vs investido</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => formatEur(v)} width={80} />
              <Tooltip formatter={(v) => (typeof v === "number" ? formatEur2(v) : `${v ?? ""}`)} />
              <Legend />
              <Line type="monotone" dataKey="value" name="Valor" stroke={VALUE_COLOR} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="invested" name="Investido" stroke={INVESTED_COLOR} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-1">Rendimento mensal {data.year}</h3>
          <p className="small text-muted mb-2">Variação do valor no mês, descontando os aportes.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Tooltip content={<ReturnTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="returnPct" name="Rendimento %" radius={[4, 4, 0, 0]}>
                {monthly.map((d) => (
                  <Cell key={d.period} fill={(d.returnPct ?? 0) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {yearly.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h3 className="h6 mb-1">Rendimento anual</h3>
          <p className="small text-muted mb-2">
            Com base nos ETFs ainda em carteira; o último ano vai até {asOf}.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={yearly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Tooltip content={<ReturnTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="returnPct" name="Rendimento %" radius={[4, 4, 0, 0]}>
                {yearly.map((d) => (
                  <Cell key={d.period} fill={(d.returnPct ?? 0) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR} />
                ))}
                <LabelList
                  dataKey="returnPct"
                  position="top"
                  className="small"
                  formatter={(v) => (typeof v === "number" ? formatPct(v) : "")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(monthly.length > 0 || yearly.length > 0) && (
        <details className="rounded border bg-white p-3">
          <summary className="small fw-medium">Ver tabela</summary>
          <div className="mt-3 d-flex flex-column gap-3">
            {monthly.length > 0 && <HistoryTable rows={monthly} firstCol={`Mês (${data.year})`} />}
            {yearly.length > 0 && <HistoryTable rows={yearly} firstCol="Ano" />}
          </div>
        </details>
      )}
    </div>
  );
}
