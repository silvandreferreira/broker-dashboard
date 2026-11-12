"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Paleta validada dos outros gráficos: preço sólido, média de 200 dias tracejada.
const PRICE_COLOR = "#059669";
const MA_COLOR = "#6366f1";

type Signal = { key: string; label: string; weight: number; value: string; score: number | null };
type Etf = {
  ticker: string;
  name: string | null;
  currency: string;
  price: number | null;
  score: number | null;
  label: string;
  reading: string;
  signals: Signal[];
  returns: { m1: number | null; m3: number | null; y1: number | null };
  chart: { date: string; close: number; ma200: number | null }[];
  index: { label: string; pe: number; peMedian5y: number; diffPct: number; forwardPe: number | null; history: { year: string; pe: number }[] } | null;
  alert: { droppingOver10: boolean; alertedAt: string | null };
  error?: string;
};
type Data = { checkedAt: string; sourceFile: { fileName: string } | null; etfs: Etf[] };

const nf = (n: number, d = 2) => n.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${nf(v, 1)}%`);
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthTick = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`;

function scoreTone(s: number | null) {
  if (s === null) return { text: "text-secondary", bar: "bg-secondary" };
  if (s >= 55) return { text: "text-success", bar: "bg-success" };
  if (s >= 40) return { text: "text-body", bar: "bg-secondary" };
  return { text: "text-danger", bar: "bg-danger" };
}

function EtfCard({ etf }: { etf: Etf }) {
  const [open, setOpen] = useState(false);
  const tone = scoreTone(etf.score);
  return (
    <div className="card border shadow-sm h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div className="min-w-0">
            <div className="fw-bold">{etf.ticker}</div>
            <div className="small text-muted text-truncate">{etf.name ?? ""}</div>
          </div>
          <div className="text-end">
            <div className={`fs-4 fw-bold lh-1 ${tone.text}`}>{etf.score ?? "—"}</div>
            <div className="small text-muted">de 100</div>
          </div>
        </div>
        <div className="progress my-2" style={{ height: 6 }} role="progressbar" aria-label={`Momento para reforçar ${etf.ticker}`} aria-valuenow={etf.score ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <div className={`progress-bar ${tone.bar}`} style={{ width: `${etf.score ?? 0}%` }} />
        </div>
        <div className={`fw-semibold ${tone.text}`}>{etf.label}</div>
        <p className="small mb-2">{etf.error ? `Sem dados: ${etf.error}` : etf.reading}</p>
        <div className="d-flex flex-wrap gap-1 mb-2">
          {etf.price !== null && (
            <span className="badge text-bg-light border">
              {nf(etf.price)} {etf.currency}
            </span>
          )}
          {etf.alert.droppingOver10 && (
            <span className="badge text-bg-danger">
              <i className="bi bi-exclamation-triangle-fill me-1" />
              Queda de mais de 10%
            </span>
          )}
          {etf.alert.alertedAt && (
            <span className="badge text-bg-light border">
              <i className="bi bi-bell-fill me-1" />
              Alerta enviado a {new Date(etf.alert.alertedAt).toLocaleDateString("pt-PT")}
            </span>
          )}
        </div>
        {!etf.error && (
          <button type="button" className="btn btn-link btn-sm px-0" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Esconder detalhe" : "Ver detalhe"}
          </button>
        )}
        {open && (
          <div className="mt-2">
            <table className="table table-sm small mb-2">
              <thead>
                <tr>
                  <th scope="col">Sinal</th>
                  <th scope="col" className="text-end">Valor</th>
                  <th scope="col" className="text-end">Nota</th>
                </tr>
              </thead>
              <tbody>
                {etf.signals.map((s) => (
                  <tr key={s.key}>
                    <td>
                      {s.label} <span className="text-muted">({s.weight}%)</span>
                    </td>
                    <td className="text-end text-nowrap">{s.value}</td>
                    <td className={`text-end ${scoreTone(s.score).text}`}>{s.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="d-flex gap-3 small mb-2">
              <span>1 mês: {signed(etf.returns.m1)}</span>
              <span>3 meses: {signed(etf.returns.m3)}</span>
              <span>1 ano: {signed(etf.returns.y1)}</span>
            </div>
            {etf.index && (
              <p className="small text-muted mb-2">
                {etf.index.label}: P/E atual {nf(etf.index.pe, 1)}x
                {etf.index.forwardPe !== null && ` (forward ${nf(etf.index.forwardPe, 1)}x)`}; histórico{" "}
                {etf.index.history.map((h) => `${h.year} ${nf(h.pe, 1)}x`).join(" · ")}.
              </p>
            )}
            <div className="small fw-semibold">Preço vs média de 200 dias (último ano)</div>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={etf.chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tickFormatter={monthTick} tick={{ fontSize: 10 }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 10 }} width={48} domain={["auto", "auto"]} />
                  <Tooltip
                    labelFormatter={(d) => new Date(String(d)).toLocaleDateString("pt-PT")}
                    formatter={(v) => `${nf(Number(v))} ${etf.currency}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="close" name="Preço" stroke={PRICE_COLOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ma200" name="Média 200 dias" stroke={MA_COLOR} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReinforcePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reinforce", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Data) => !cancelled && setData(d))
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("Não foi possível calcular os sinais agora.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) {
    return (
      <div className="d-flex align-items-center text-secondary py-4">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />A calcular...
      </div>
    );
  }
  if (data.etfs.length === 0) {
    return <p className="text-muted small mb-0">Carrega um ficheiro da XTB para ver os teus ETFs aqui.</p>;
  }

  return (
    <div>
      <p className="small text-muted">
        Para cada ETF da carteira ({data.sourceFile?.fileName ?? "último ficheiro"}), uma nota de 0 a 100 de quão boa é a
        altura para reforçar, face ao próprio histórico: desconto face ao máximo de 52 semanas (30%), distância à média
        de 200 dias (25%), RSI de 14 dias (15%) e posição no intervalo do último ano (10%). Nos ETFs do S&amp;P 500 entra
        também o P/E do índice face à mediana de 5 anos (20%), calculado com as ações do radar. Mostra descontos, não
        prevê o futuro. Cotações às{" "}
        {new Date(data.checkedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}.
      </p>
      <div className="row g-3">
        {data.etfs.map((e) => (
          <div key={e.ticker} className="col-12 col-md-6 col-xl-4">
            <EtfCard etf={e} />
          </div>
        ))}
      </div>
    </div>
  );
}
