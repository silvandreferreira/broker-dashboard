import { closeOnOrBefore, type DailyCloses } from "@/lib/yahoo";

/**
 * Reconstrói a evolução da carteira a partir dos lotes abertos e de preços históricos.
 *
 * Valor no fim do período = Σ (unidades × fecho nesse dia) dos lotes já comprados.
 * Aporte do período       = Σ investido dos lotes comprados nesse período.
 * Ganho do período (€)    = Valor_fim − Valor_início − Aporte.
 *
 * Rendimento do período (%) = rendimento ponderado no tempo (TWR), encadeado diariamente:
 *   r_dia = (V_dia − V_dia_anterior − Aporte_dia) / (V_dia_anterior + Aporte_dia)
 *   rendimento = Π(1 + r_dia) − 1
 * Mede como correram os ETFs, independentemente de quando/quanto dinheiro entrou
 * (um aporte grande no fim do ano não "dilui" o rendimento desse ano).
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

/** Índice TWR acumulado por dia de negociação: [data, fator], fator inicial = 1. */
type TwrIndex = [string, number][];

function buildTwrIndex(lots: HistoryLot[], series: Map<string, DailyCloses>, asOf: Date): TwrIndex {
  if (lots.length === 0) return [];
  const firstDay = isoDate(new Date(Math.min(...lots.map((l) => l.openedAt.getTime()))));
  const lastDay = isoDate(asOf);
  const days = new Set<string>();
  for (const s of series.values()) {
    for (const [d] of s) if (d >= firstDay && d <= lastDay) days.add(d);
  }

  const index: TwrIndex = [];
  let factor = 1;
  let prev = { value: 0, invested: 0 };
  for (const day of [...days].sort()) {
    const endOfDay = new Date(`${day}T23:59:59.999Z`);
    const cur = valuationAt(lots, series, endOfDay.getTime() > asOf.getTime() ? asOf : endOfDay);
    const contribution = cur.invested - prev.invested;
    const base = prev.value + contribution;
    if (base > 0) factor *= 1 + (cur.value - prev.value - contribution) / base;
    index.push([day, factor]);
    prev = cur;
  }
  return index;
}

function factorAt(index: TwrIndex, date: string): number {
  let lo = 0;
  let hi = index.length - 1;
  let found = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (index[mid][0] <= date) {
      found = index[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function buildSeries(
  lots: HistoryLot[],
  series: Map<string, DailyCloses>,
  periods: { period: string; cutoff: Date }[],
  start: { value: number; invested: number; cutoff: Date },
  twr: TwrIndex,
): HistoryPoint[] {
  let prev = start;
  return periods.map(({ period, cutoff }) => {
    const cur = valuationAt(lots, series, cutoff);
    const contribution = cur.invested - prev.invested;
    const gain = cur.value - prev.value - contribution;
    const twrReturn = factorAt(twr, isoDate(cutoff)) / factorAt(twr, isoDate(prev.cutoff)) - 1;
    const point: HistoryPoint = {
      period,
      date: isoDate(cutoff),
      value: round2(cur.value),
      invested: round2(cur.invested),
      contribution: round2(contribution),
      gain: round2(gain),
      returnPct: cur.invested > 0 ? round2(twrReturn * 100) : null,
      totalProfit: round2(cur.value - cur.invested),
    };
    prev = { ...cur, cutoff };
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
  const startCutoff = new Date(Date.UTC(year, 0, 1) - 1);
  const start = { ...valuationAt(lots, series, startCutoff), cutoff: startCutoff };
  const twr = buildTwrIndex(lots, series, asOf);
  // Não mostrar meses antes do primeiro lote
  return buildSeries(lots, series, periods, start, twr).filter(
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
  const twr = buildTwrIndex(lots, series, asOf);
  return buildSeries(lots, series, periods, { value: 0, invested: 0, cutoff: new Date(0) }, twr);
}
