/**
 * Mapeamento: ticker (sem bolsa) → nome do índice para agrupar no gráfico.
 * Tickers são normalizados (uppercase, sem sufixo .DE/.PA/etc.) antes de procurar.
 *
 * Agrupamentos ativos (confirmados):
 * S&P 500 | MSCI World | All-World | MSCI Europe | Emerging Markets | US Tech (Nasdaq)
 */
const TICKER_TO_INDEX: Record<string, string> = {
  // S&P 500
  SXR8: "S&P 500",
  VUAA: "S&P 500",
  CSPX: "S&P 500",
  VUSA: "S&P 500",
  // MSCI World
  IWDA: "MSCI World",
  SWDA: "MSCI World",
  // All-World
  VWCE: "All-World",
  VWRA: "All-World",
  // MSCI Europe
  IS3N: "MSCI Europe",
  EUNA: "MSCI Europe",
  // Emerging Markets
  EIMI: "Emerging Markets",
  VFEM: "Emerging Markets",
  // US Tech / Nasdaq
  EQQQ: "US Tech (Nasdaq)",
  QDVE: "US Tech (Nasdaq)",
};

function normalizeTicker(ticker: string): string {
  return ticker.replace(/\s+/g, "").replace(/\.(DE|PA|AS|LS|L|SW|MI|BR)$/i, "").toUpperCase() || ticker;
}

export function getIndexGroupForTicker(ticker: string): string | null {
  const key = normalizeTicker(ticker);
  return TICKER_TO_INDEX[key] ?? null;
}

export function getDisplayNameForTicker(ticker: string): string {
  return getIndexGroupForTicker(ticker) ?? ticker;
}
