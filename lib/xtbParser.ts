import * as XLSX from "xlsx";
import { INVESTMENT_PLAN, MY_TRADES, type Product } from "@/lib/assetFilter";

/**
 * Parser do relatório XTB (xStation 5 → Histórico → Exportar Excel).
 *
 * Folha "Open Positions":
 *   - cabeçalho com Product | Instrument/Position | Ticker | Category | Type | Volume |
 *     Value | Current price | Open price | Open time (UTC) | ... | Gross Profit | ...
 *   - por cada ticker há uma linha-resumo (Type vazio, Category preenchida) seguida
 *     de uma linha por lote (Type = BUY/SELL, Category vazia).
 *
 * Só são lidos os lotes (para não contar a dobrar) e só de instrumentos ETF.
 * Cada lote fica marcado com o produto ("My Trades" ou "Investment Plan") para o
 * dashboard poder incluir ou excluir os planos de investimento.
 * Valores monetários (Value, Gross Profit) vêm na moeda da conta (EUR);
 * o investido é calculado como Value − Gross Profit para ficar sempre na moeda da conta.
 */

export type AssetRow = {
  ticker: string;
  name?: string;
  category?: string;
  type: string;
  quantity: number;
  avgPrice?: number;
  investedValue: number;
  currentValue: number;
  profitLoss: number;
  year?: number;
  openedAt?: Date;
  product: Product;
};


export type ParseResult = {
  rows: AssetRow[];
  /** Tickers ignorados por não serem ETF (ex.: ações, ETC). */
  skippedTickers: string[];
  /** N.º de lotes de planos de investimento importados. */
  investmentPlanLots: number;
  /** Data de geração do relatório ("Data as of report generated"). */
  reportDate?: Date;
  error?: string;
};

const INVESTMENT_PLAN_RE = /investment\s*plans?/i;

/** Categorias incluídas no dashboard. */
const INCLUDED_CATEGORIES = new Set(["ETF"]);

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/[\s€$]/g, "");
  if (!s) return 0;
  // "1.234,56" → 1234.56 ; "1,234.56" → 1234.56 ; "12,5" → 12.5
  const normalized =
    s.includes(",") && s.includes(".")
      ? s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "")
      : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Datas da XTB estão em UTC ("2026-11-05 14:00:32" ou célula de data Excel). */
function toDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  // Número de série Excel (dias desde 1899-12-30), interpretado como UTC
  if (typeof v === "number" && v > 0) return new Date(Math.round((v - 25569) * 86400000));
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = iso;
    return new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss));
  }
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
  return undefined;
}

export function parseXtbOpenPositions(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => /open\s*positions?/i.test(n));
  if (!sheetName) {
    return {
      rows: [],
      skippedTickers: [],
      investmentPlanLots: 0,
      error: "Folha «Open Positions» não encontrada no ficheiro.",
    };
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
  }) as unknown[][];

  const reportRow = rows.find((r) => /data as of report generated/i.test(String(r[0])));
  const reportDate = reportRow ? toDate(reportRow[1]) : undefined;

  const required = ["ticker", "volume", "value", "gross profit"];
  const headerIndex = rows.findIndex((r) =>
    required.every((c) => r.some((cell) => norm(cell) === c)),
  );
  if (headerIndex < 0) {
    return {
      rows: [],
      skippedTickers: [],
      investmentPlanLots: 0,
      error:
        "Cabeçalho da folha «Open Positions» não reconhecido (esperadas as colunas Ticker, Volume, Value, Gross Profit).",
    };
  }

  const header = rows[headerIndex].map(norm);
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    product: col("product"),
    instrument: col("instrument/position", "instrument"),
    ticker: col("ticker"),
    category: col("category"),
    type: col("type"),
    volume: col("volume"),
    value: col("value"),
    openPrice: col("open price"),
    openTime: col("open time (utc)", "open time"),
    grossProfit: col("gross profit"),
  };
  const cell = (r: unknown[], i: number) => (i >= 0 ? r[i] : "");

  // 1.ª passagem: linhas-resumo → categoria e nome do instrumento por ticker
  const meta = new Map<string, { category: string; name: string }>();
  for (const r of rows.slice(headerIndex + 1)) {
    const ticker = String(cell(r, c.ticker)).trim();
    const category = String(cell(r, c.category)).trim();
    if (ticker && category && !meta.has(ticker)) {
      meta.set(ticker, { category, name: String(cell(r, c.instrument)).trim() });
    }
  }

  // 2.ª passagem: lotes (Type = BUY/SELL)
  const result: AssetRow[] = [];
  const skipped = new Set<string>();
  let investmentPlanLots = 0;
  for (const r of rows.slice(headerIndex + 1)) {
    const ticker = String(cell(r, c.ticker)).trim();
    if (!ticker || !/^(buy|sell)$/i.test(String(cell(r, c.type)).trim())) continue;

    const info = meta.get(ticker);
    const category = (info?.category || String(cell(r, c.category)).trim()).toUpperCase();
    if (!INCLUDED_CATEGORIES.has(category)) {
      skipped.add(ticker);
      continue;
    }

    const quantity = toNumber(cell(r, c.volume));
    if (quantity <= 0) continue;

    const product: Product = INVESTMENT_PLAN_RE.test(String(cell(r, c.product)))
      ? INVESTMENT_PLAN
      : MY_TRADES;
    if (product === INVESTMENT_PLAN) investmentPlanLots++;

    const currentValue = toNumber(cell(r, c.value));
    const profitLoss = toNumber(cell(r, c.grossProfit));
    const openPrice = toNumber(cell(r, c.openPrice));
    const openedAt = toDate(cell(r, c.openTime));

    result.push({
      ticker,
      name: info?.name || undefined,
      category,
      type: category,
      quantity,
      avgPrice: openPrice || undefined,
      investedValue: currentValue - profitLoss,
      currentValue,
      profitLoss,
      year: openedAt?.getUTCFullYear(),
      openedAt,
      product,
    });
  }

  return { rows: result, skippedTickers: [...skipped].sort(), investmentPlanLots, reportDate };
}
