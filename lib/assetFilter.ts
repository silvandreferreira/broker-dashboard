import type { Prisma } from "@prisma/client";

export const INVESTMENT_PLAN = "Investment Plan";
export const MY_TRADES = "My Trades";
export type Product = typeof INVESTMENT_PLAN | typeof MY_TRADES;

/** Categorias que entram no dashboard (ver lib/xtbParser.ts e lib/t212Parser.ts). */
export const DASHBOARD_CATEGORIES = ["ETF", "STOCK"] as const;

export type BrokerFilter = "all" | "XTB" | "T212";
export type KindFilter = "all" | "ETF" | "STOCK";

export type DashboardFilters = { includePlans: boolean; broker: BrokerFilter; kind: KindFilter };

/** `?includePlans=false` exclui planos de investimento; por defeito são incluídos. */
export function parseIncludePlans(searchParams: URLSearchParams): boolean {
  return searchParams.get("includePlans") !== "false";
}

/** `?includePlans=…&broker=all|XTB|T212&kind=all|ETF|STOCK` */
export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const b = searchParams.get("broker");
  const k = searchParams.get("kind");
  return {
    includePlans: parseIncludePlans(searchParams),
    broker: b === "XTB" || b === "T212" ? b : "all",
    kind: k === "ETF" || k === "STOCK" ? k : "all",
  };
}

/** Ativos que entram no dashboard, segundo os filtros (planos, corretora, ETF/ação). */
export function dashboardAssetWhere(
  includePlansOrFilters: boolean | DashboardFilters,
): Prisma.AssetWhereInput {
  const f: DashboardFilters =
    typeof includePlansOrFilters === "boolean"
      ? { includePlans: includePlansOrFilters, broker: "all", kind: "all" }
      : includePlansOrFilters;
  const and: Prisma.AssetWhereInput[] = [
    { category: f.kind === "all" ? { in: [...DASHBOARD_CATEGORIES] } : f.kind },
  ];
  // product null = upload anterior à distinção → tratado como My Trades
  if (!f.includePlans) and.push({ OR: [{ product: null }, { product: { not: INVESTMENT_PLAN } }] });
  // broker null = upload anterior às várias corretoras → XTB
  if (f.broker === "XTB") and.push({ OR: [{ broker: null }, { broker: "XTB" }] });
  if (f.broker === "T212") and.push({ broker: "T212" });
  return { AND: and };
}
