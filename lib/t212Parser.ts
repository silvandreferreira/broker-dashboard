/**
 * Parser do histórico da Trading 212 (Histórico → Exportar → CSV).
 *
 * O CSV é uma lista de movimentos (não uma fotografia das posições como o da XTB):
 *   Action, Time (UTC), ISIN, Ticker, Name, ID, No. of shares, Price / share,
 *   Currency (Price / share), Exchange rate, Result, Currency (Result), Total,
 *   Currency (Total), Currency conversion fee, ...
 *
 * Só as ordens de compra/venda contam ("Market buy", "Limit sell", "Stop sell", ...).
 * Depósitos, dividendos, juros, etc. são ignorados.
 * As posições abertas obtêm-se com FIFO (as vendas saem das compras mais antigas):
 * ver `openLotsFifo`.
 */

export type T212Transaction = {
  /** ID da ordem na Trading 212 (único: serve para juntar vários CSV sem duplicar). */
  id: string;
  side: "buy" | "sell";
  action: string;
  /** ISO, UTC */
  time: string;
  isin: string;
  ticker: string;
  name: string;
  shares: number;
  price: number;
  priceCurrency: string;
  /** Valor pago/recebido, já com a comissão de câmbio */
  total: number;
  totalCurrency: string;
};

export type T212ParseResult = {
  transactions: T212Transaction[];
  /** Linhas que não são ordens (depósitos, dividendos, ...), por tipo. */
  ignored: Record<string, number>;
  error?: string;
};

const REQUIRED = ["action", "time (utc)", "isin", "ticker", "no. of shares", "price / share", "total"];

/** Divide uma linha CSV respeitando aspas ("a, b" fica num só campo). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** O ficheiro parece um export da Trading 212? (pela linha de cabeçalho) */
export function looksLikeT212(text: string): boolean {
  const header = splitCsvLine(text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "").map((h) => h.toLowerCase());
  return REQUIRED.every((c) => header.includes(c));
}

export function parseT212Csv(text: string): T212ParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { transactions: [], ignored: {}, error: "Ficheiro vazio." };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  if (!REQUIRED.every((c) => header.includes(c))) {
    return {
      transactions: [],
      ignored: {},
      error: "Cabeçalho não reconhecido (esperadas as colunas Action, Time (UTC), ISIN, Ticker, No. of shares, Price / share, Total).",
    };
  }
  const idx = (name: string) => header.indexOf(name);
  const c = {
    action: idx("action"),
    time: idx("time (utc)"),
    isin: idx("isin"),
    ticker: idx("ticker"),
    name: idx("name"),
    id: idx("id"),
    shares: idx("no. of shares"),
    price: idx("price / share"),
    priceCur: idx("currency (price / share)"),
    total: idx("total"),
    totalCur: idx("currency (total)"),
  };

  const transactions: T212Transaction[] = [];
  const ignored: Record<string, number> = {};
  for (const line of lines.slice(1)) {
    const r = splitCsvLine(line);
    const get = (i: number) => (i >= 0 ? (r[i] ?? "") : "");
    const action = get(c.action);
    const side = /\bbuy\b/i.test(action) ? "buy" : /\bsell\b/i.test(action) ? "sell" : null;
    const shares = Number(get(c.shares));
    const total = Number(get(c.total));
    if (!side || !get(c.isin) || !(shares > 0) || !Number.isFinite(total)) {
      ignored[action || "?"] = (ignored[action || "?"] ?? 0) + 1;
      continue;
    }
    const t = get(c.time);
    const time = new Date(t.includes("T") || /[+-]\d\d:\d\d$/.test(t) ? t.replace(" ", "T") : `${t.replace(" ", "T")}Z`);
    if (Number.isNaN(time.getTime())) {
      ignored[action] = (ignored[action] ?? 0) + 1;
      continue;
    }
    const ticker = get(c.ticker).toUpperCase();
    transactions.push({
      // Sem ID (exports antigos): chave estável a partir do conteúdo da linha
      id: get(c.id) || `${t}|${get(c.isin)}|${side}|${shares}|${total}`,
      side,
      action,
      time: time.toISOString(),
      isin: get(c.isin).toUpperCase(),
      ticker,
      name: get(c.name) || ticker,
      shares,
      price: Number(get(c.price)) || 0,
      priceCurrency: get(c.priceCur).toUpperCase() || "EUR",
      total,
      totalCurrency: get(c.totalCur).toUpperCase() || "EUR",
    });
  }
  transactions.sort((a, b) => a.time.localeCompare(b.time));
  return { transactions, ignored };
}

/** Lote aberto (o que sobra de uma compra depois das vendas). */
export type OpenLot = {
  isin: string;
  ticker: string;
  name: string;
  shares: number;
  /** Preço por unidade na moeda de negociação */
  price: number;
  priceCurrency: string;
  /** Valor pago pela parte que sobra do lote, na moeda do "Total" */
  total: number;
  totalCurrency: string;
  openedAt: string;
};

/**
 * Posições abertas por FIFO. Vendas sem compras suficientes no ficheiro (posições
 * abertas antes do período exportado) são ignoradas e devolvidas em `unmatchedSells`.
 */
export function openLotsFifo(transactions: T212Transaction[]): {
  lots: OpenLot[];
  unmatchedSells: { ticker: string; shares: number }[];
} {
  const byIsin = new Map<string, OpenLot[]>();
  const unmatched = new Map<string, number>();
  const EPS = 1e-9;
  for (const tx of [...transactions].sort((a, b) => a.time.localeCompare(b.time))) {
    const queue = byIsin.get(tx.isin) ?? [];
    byIsin.set(tx.isin, queue);
    if (tx.side === "buy") {
      queue.push({
        isin: tx.isin,
        ticker: tx.ticker,
        name: tx.name,
        shares: tx.shares,
        price: tx.price,
        priceCurrency: tx.priceCurrency,
        total: tx.total,
        totalCurrency: tx.totalCurrency,
        openedAt: tx.time,
      });
      continue;
    }
    let left = tx.shares;
    while (left > EPS && queue.length) {
      const lot = queue[0];
      const take = Math.min(left, lot.shares);
      // O custo sai na proporção das unidades vendidas
      lot.total -= (lot.total * take) / lot.shares;
      lot.shares -= take;
      left -= take;
      if (lot.shares <= EPS) queue.shift();
    }
    if (left > EPS) unmatched.set(tx.ticker, (unmatched.get(tx.ticker) ?? 0) + left);
  }
  return {
    lots: [...byIsin.values()].flat(),
    unmatchedSells: [...unmatched.entries()].map(([ticker, shares]) => ({ ticker, shares })),
  };
}

/** ETF (fundos UCITS, ISIN IE/LU, ou nome típico) ou ação. */
export function t212Category(isin: string, name: string): "ETF" | "STOCK" {
  if (/^(IE|LU)/.test(isin)) return "ETF";
  return /\b(ETF|UCITS)\b|\((Acc|Dist)\)/i.test(name) ? "ETF" : "STOCK";
}

/**
 * Ticker no mesmo formato que a XTB usa (TICKER.BOLSA), para o mesmo ETF/ação
 * nas duas corretoras ficar agrupado e o Yahoo encontrar a cotação.
 */
export function t212Ticker(lot: Pick<OpenLot, "ticker" | "isin" | "priceCurrency">): string {
  if (lot.isin.startsWith("US") || lot.priceCurrency === "USD") return `${lot.ticker}.US`;
  if (lot.priceCurrency === "GBX" || lot.priceCurrency === "GBP") return `${lot.ticker}.UK`;
  // ETFs/ações europeias em EUR: Xetra é a bolsa por defeito da Trading 212
  return `${lot.ticker}.DE`;
}
