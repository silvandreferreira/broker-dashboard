import type { Prisma } from "@prisma/client";

export const INVESTMENT_PLAN = "Investment Plan";
export const MY_TRADES = "My Trades";
export type Product = typeof INVESTMENT_PLAN | typeof MY_TRADES;

/** `?includePlans=false` exclui planos de investimento; por defeito são incluídos. */
export function parseIncludePlans(searchParams: URLSearchParams): boolean {
  return searchParams.get("includePlans") !== "false";
}

/** Ativos que entram no dashboard: só ETFs e, opcionalmente, sem planos de investimento. */
export function dashboardAssetWhere(includePlans: boolean): Prisma.AssetWhereInput {
  if (includePlans) return { category: "ETF" };
  // product null = upload anterior à distinção → tratado como My Trades
  return { category: "ETF", OR: [{ product: null }, { product: { not: INVESTMENT_PLAN } }] };
}
