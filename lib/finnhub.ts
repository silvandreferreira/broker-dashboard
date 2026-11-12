/**
 * Cliente mínimo do Finnhub (plano gratuito: 60 pedidos/minuto).
 * Chave em FINNHUB_API_KEY. Documentação: https://finnhub.io/docs/api
 */
const BASE = "https://finnhub.io/api/v1";

export class FinnhubError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function finnhub<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new FinnhubError("FINNHUB_API_KEY em falta");
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "X-Finnhub-Token": key },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new FinnhubError(`Finnhub ${path} ${params.symbol ?? ""}: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

export type SeriesPoint = { period: string; v: number };
export type MetricResponse = {
  metric?: Record<string, number | string | null>;
  series?: { annual?: Record<string, SeriesPoint[]>; quarterly?: Record<string, SeriesPoint[]> };
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
