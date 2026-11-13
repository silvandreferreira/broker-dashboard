/**
 * Custo de gestão anual (TER / OCF, em %) dos ETFs, tirado das fichas dos emitentes.
 * Não há API gratuita para isto: quando um ETF novo entra na carteira, acrescenta-o aqui.
 * Chave: ticker sem bolsa (SXR8.DE → SXR8).
 */
const TER: Record<string, number> = {
  // S&P 500
  SXR8: 0.07,
  CSPX: 0.07,
  VUAA: 0.07,
  VUSA: 0.07,
  SPYL: 0.03,
  // Setores / temáticos
  QDVE: 0.15,
  XDW0: 0.25,
  XDWH: 0.25,
  "2B76": 0.4,
  EQQQ: 0.3,
  // Mundo / regiões
  VWCE: 0.14, // reduzido de 0,19% para 0,14% em julho de 2026
  VWRA: 0.14,
  IWDA: 0.2,
  SWDA: 0.2,
  IXUA: 0.15,
  IMAE: 0.12,
  IS3N: 0.18,
  EIMI: 0.18,
};

export function getTer(ticker: string): number | null {
  const key = ticker.split(".")[0].toUpperCase();
  return TER[key] ?? null;
}
