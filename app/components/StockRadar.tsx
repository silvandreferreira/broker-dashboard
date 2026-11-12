"use client";

import { useEffect, useMemo, useState } from "react";
import { StockDetailView } from "./StockDetail";
import { scoreClass, STYLE_BADGE } from "./stockUi";

type RadarStock = {
  symbol: string;
  name: string;
  sector: string;
  style: "Growth" | "Value" | "REIT";
  quality: number | null;
  valuation: number | null;
  qualityLabel: string;
  valuationLabel: string;
  reading: string;
  marketCap: number | null;
};
type RadarData = { updatedAt: string | null; coverage: { withData: number; total: number }; stocks: RadarStock[] };

const STYLES = ["Todas", "Growth", "Value", "REIT"] as const;
const SORTS = {
  opportunity: "Oportunidade (qualidade + preço)",
  valuation: "Mais baratas",
  quality: "Melhor qualidade",
  marketCap: "Maior capitalização",
} as const;
type SortKey = keyof typeof SORTS;
const PAGE = 48;

const opportunity = (s: RadarStock) =>
  s.quality === null || s.valuation === null ? -1 : (s.quality + s.valuation) / 2;

export function StockRadar() {
  const [data, setData] = useState<RadarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Todas");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("opportunity");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stocks", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: RadarData) => !cancelled && setData(d))
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar o radar de ações.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.stocks.filter(
      (s) =>
        (style === "Todas" || s.style === style) &&
        (!q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)),
    );
    const key: Record<SortKey, (s: RadarStock) => number> = {
      opportunity,
      valuation: (s) => s.valuation ?? -1,
      quality: (s) => s.quality ?? -1,
      marketCap: (s) => s.marketCap ?? -1,
    };
    return filtered.sort((a, b) => key[sort](b) - key[sort](a));
  }, [data, style, query, sort]);

  if (selected) {
    return <StockDetailView symbol={selected} onBack={() => setSelected(null)} />;
  }
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) {
    return (
      <div className="d-flex align-items-center text-secondary py-4">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        A carregar radar...
      </div>
    );
  }

  return (
    <div>
      <p className="small text-muted mb-3">
        Ações do S&amp;P 500 com duas notas de 0 a 100, calculadas face às outras ações do índice:{" "}
        <strong>Qualidade</strong> (rentabilidade, crescimento, balanço, consistência) e <strong>Valuation</strong>{" "}
        (preço face à própria história, ao setor, ao crescimento e ao free cash flow; 100 = mais barata). Dados do
        Finnhub, atualizados todos os dias. É uma ajuda para filtrar ideias, não uma recomendação de compra.
      </p>

      {data.coverage.withData < data.coverage.total && (
        <div className="alert alert-info small py-2">
          A carregar dados: {data.coverage.withData} de {data.coverage.total} ações. O resto fica disponível nos
          próximos dias.
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Estilo">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${style === s ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => {
                setStyle(s);
                setLimit(PAGE);
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="form-control form-control-sm"
          style={{ maxWidth: 220 }}
          placeholder="Pesquisar (ex.: NVDA, Apple)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="Pesquisar ação"
        />
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 260 }}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Ordenar"
        >
          {Object.entries(SORTS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span className="small text-muted ms-auto">
          {list.length} ações
          {data.updatedAt &&
            ` · atualizado ${new Date(data.updatedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}`}
        </span>
      </div>

      <div className="row g-3">
        {list.slice(0, limit).map((s) => (
          <div key={s.symbol} className="col-12 col-md-6 col-xl-4">
            <button
              type="button"
              className="card h-100 w-100 text-start border shadow-sm stock-card"
              onClick={() => setSelected(s.symbol)}
            >
              <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="fw-bold">{s.symbol}</span>
                  <span className={`badge ${STYLE_BADGE[s.style]}`}>{s.style}</span>
                </div>
                <div className="small text-muted text-truncate mb-2">
                  {s.name} · {s.sector}
                </div>
                <div className="rounded bg-body-tertiary border px-2 py-1 small mb-2">
                  <div className="text-uppercase text-muted" style={{ fontSize: "0.7rem" }}>
                    Leitura
                  </div>
                  <div className="fw-semibold">{s.reading}</div>
                </div>
                <div className="d-flex justify-content-between small">
                  <div>
                    <div className="text-uppercase text-muted" style={{ fontSize: "0.7rem" }}>
                      Valuation
                    </div>
                    <span className={`fw-bold ${scoreClass(s.valuation)}`}>
                      {s.valuation ?? "—"} · {s.valuationLabel}
                    </span>
                  </div>
                  <div className="text-end">
                    <div className="text-uppercase text-muted" style={{ fontSize: "0.7rem" }}>
                      Qualidade
                    </div>
                    <span className={`fw-bold ${scoreClass(s.quality)}`}>
                      {s.quality ?? "—"} · {s.qualityLabel}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {list.length > limit && (
        <div className="text-center mt-3">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
            Mostrar mais ({list.length - limit} restantes)
          </button>
        </div>
      )}
      {list.length === 0 && <p className="text-muted small">Nenhuma ação encontrada.</p>}
    </div>
  );
}
