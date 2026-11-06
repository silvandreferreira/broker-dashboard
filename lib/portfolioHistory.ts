import { closeOnOrBefore, type DailyCloses } from "@/lib/yahoo";

/**
 * Reconstrói a evolução da carteira a partir dos lotes abertos e de preços históricos.
 *
 * Valor no fim do período = Σ (unidades × fecho nesse dia) dos lotes já comprados.
 * Aporte do período       = Σ investido dos lotes comprados nesse período.
 * Rendimento do período   = (Valor_fim − Valor_início − Aporte) / (Valor_início + Aporte)
 *   (assume aportes no início do período — aproximação simples e estável).
 *
 * Limitação: só entram os lotes ainda abertos no relatório. Lotes vendidos antes
 * da data do relatório não aparecem nos meses em que ainda existiam.
 */

export type HistoryLot = {
  ticker: string;
  quantity: number;
  investedValue: number;
  openedAt: Date;
};

export type HistoryPoint = {
  /** "YYYY-MM" (mensal) ou "YYYY" (anual) */
  period: string;
  /** Data da avaliação (fim do período ou data do relatório) */
  date: string;
  value: number;
  invested: number;
  contribution: number;
  /** Lucro do período em € (exclui aportes) */
  gain: number;
  /** Rendimento do período em %, null se não houver base */
  returnPct: number | null;
  /** Lucro acumulado = valor − investido */
  totalProfit: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function valuationAt(
  lots: HistoryLot[],
  series: Map<string, DailyCloses>,
  cutoff: Date,
): { value: number; invested: number } {
  const day = isoDate(cutoff);
  let value = 0;
  let invested = 0;
  for (const lot of lots) {
    if (lot.openedAt.getTime() > cutoff.getTime()) continue;
    const s = series.get(lot.ticker);
    if (!s) continue;
    // Se ainda não houver fecho (comprado no próprio dia antes do 1.º fecho), vale o investido
    const close = closeOnOrBefore(s, day);
    value += close != null ? lot.quantity * close : lot.investedValue;
    invested += lot.investedValue;
  }
  return { value, invested };
}

function buildSeries(
  lots: HistoryLot[],
  series: Map<string, DailyCloses>,
  periods: { period: string; cutoff: Date }[],
  start: { value: number; invested: number },
): HistoryPoint[] {
  let prev = start;
  return periods.map(({ period, cutoff }) => {
    const cur = valuationAt(lots, series, cutoff);
    const contribution = cur.invested - prev.invested;
    const gain = cur.value - prev.value - contribution;
    const base = prev.value + contribution;
    const point: HistoryPoint = {
      period,
      date: isoDate(cutoff),
      value: round2(cur.value),
      invested: round2(cur.invested),
      contribution: round2(contribution),
      gain: round2(gain),
      returnPct: base > 0 ? round2((gain / base) * 100) : null,
      totalProfit: round2(cur.value - cur.invested),
    };
    prev = cur;
    return point;
  });
}

/** Último instante do mês (UTC), limitado a `max`. */
function endOfMonth(year: number, month0: number, max: Date): Date {
  const end = new Date(Date.UTC(year, month0 + 1, 1) - 1);
  return end.getTime() > max.getTime() ? max : end;
}

/** Meses do ano `year` (até `asOf`), com o fim do ano anterior como ponto de partida. */
export function monthlyHistory(
  lots: HistoryLot[],
  series: Map<string, DailyCloses>,
  year: number,
  asOf: Date,
): HistoryPoint[] {
  const lastMonth = asOf.getUTCFullYear() === year ? asOf.getUTCMonth() : 11;
  const periods = [];
  for (let m = 0; m <= lastMonth; m++) {
    periods.push({
      period: `${year}-${String(m + 1).padStart(2, "0")}`,
      cutoff: endOfMonth(year, m, asOf),
    });
  }
  const start = valuationAt(lots, series, new Date(Date.UTC(year, 0, 1) - 1));
  // Não mostrar meses antes do primeiro lote
  return buildSeries(lots, series, periods, start).filter(
    (p) => p.invested > 0 || p.contribution !== 0,
  );
}

/** Um ponto por ano, desde o ano do primeiro lote até ao ano de `asOf`. */
export function yearlyHistory(
  lots: HistoryLot[],
  series: Map<string, DailyCloses>,
  asOf: Date,
): HistoryPoint[] {
  if (lots.length === 0) return [];
  const firstYear = Math.min(...lots.map((l) => l.openedAt.getUTCFullYear()));
  const periods = [];
  for (let y = firstYear; y <= asOf.getUTCFullYear(); y++) {
    periods.push({ period: String(y), cutoff: endOfMonth(y, 11, asOf) });
  }
  return buildSeries(lots, series, periods, { value: 0, invested: 0 });
}
