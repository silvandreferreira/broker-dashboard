import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDisplayNameForTicker } from "@/lib/etfIndexGroups";
import { isAdminEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CATEGORIES, INVESTMENT_PLAN, dashboardAssetWhere, parseDashboardFilters } from "@/lib/assetFilter";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(session.user.email);
  if (!isAdmin && session.user.accessApproved !== true) {
    return NextResponse.json({ error: "Access pending approval" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  let fileId = searchParams.get("fileId");
  const filters = parseDashboardFilters(searchParams);

  if (!fileId) {
    const active = await prisma.uploadedFile.findFirst({
      where: { userId: (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))!.id, isActive: true },
      select: { id: true },
    });
    fileId = active?.id ?? null;
  }

  if (!fileId) {
    return NextResponse.json({
      summary: null,
      byCategory: [],
      byYear: [],
      investedVsProfitByYear: [],
      byTicker: [],
      byIndexGroup: [],
    });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }

  // ETFs e ações (ver lib/xtbParser.ts). Ficheiros carregados com o parser antigo não têm categoria.
  const fileWhere = { fileId, file: { userId: user.id } };
  const known = { category: { in: [...DASHBOARD_CATEGORIES] } };
  const [assets, totalAssets, etfAssets, planAssets, brokerRows, kindRows] = await Promise.all([
    prisma.asset.findMany({ where: { ...fileWhere, ...dashboardAssetWhere(filters) } }),
    prisma.asset.count({ where: fileWhere }),
    prisma.asset.count({ where: { ...fileWhere, ...known } }),
    prisma.asset.count({ where: { ...fileWhere, ...known, product: INVESTMENT_PLAN } }),
    prisma.asset.findMany({ where: { ...fileWhere, ...known }, select: { broker: true }, distinct: ["broker"] }),
    prisma.asset.findMany({ where: { ...fileWhere, ...known }, select: { category: true }, distinct: ["category"] }),
  ]);
  // O que existe na entrada (para o UI só mostrar seletores que fazem sentido)
  const available = {
    brokers: [...new Set(brokerRows.map((b) => b.broker ?? "XTB"))].sort(),
    kinds: kindRows.map((k) => k.category!).sort(),
  };

  if (etfAssets === 0 && totalAssets > 0) {
    return NextResponse.json({
      needsReupload: true,
      available,
      byBroker: [],
      hasInvestmentPlans: false,
      summary: null,
      byCategory: [],
      byYear: [],
      investedVsProfitByYear: [],
      byTicker: [],
      byIndexGroup: [],
    });
  }

  const etfCount = new Set(assets.map((a) => a.ticker)).size;
  const totalUnits = assets.reduce((s, a) => s + a.quantity, 0);
  const totalInvested = assets.reduce((s, a) => s + a.investedValue, 0);
  const totalCurrent = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalProfit = totalCurrent - totalInvested;
  const profitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  const summary = {
    etfCount,
    totalUnits,
    totalInvested,
    totalAcc: totalCurrent - totalInvested,
    totalEuros: totalCurrent,
    profitPercent,
  };

  const categoryMap = new Map<string, { invested: number; current: number; units: number }>();
  for (const a of assets) {
    const key = (a.category && a.category.trim()) || a.ticker;
    const cur = categoryMap.get(key) ?? { invested: 0, current: 0, units: 0 };
    cur.invested += a.investedValue;
    cur.current += a.currentValue;
    cur.units += a.quantity;
    categoryMap.set(key, cur);
  }
  const byCategory = Array.from(categoryMap.entries()).map(([name, v]) => ({
    name,
    value: totalCurrent > 0 ? (v.current / totalCurrent) * 100 : 0,
    current: v.current,
    invested: v.invested,
    units: v.units,
  })).sort((a, b) => b.value - a.value);

  const yearMap = new Map<number, { invested: number; profit: number; current: number }>();
  for (const a of assets) {
    const y = a.year ?? new Date().getFullYear();
    const cur = yearMap.get(y) ?? { invested: 0, profit: 0, current: 0 };
    cur.invested += a.investedValue;
    cur.profit += a.profitLoss;
    cur.current += a.currentValue;
    yearMap.set(y, cur);
  }
  const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
  const byYear = years.map((year) => {
    const v = yearMap.get(year)!;
    const pct = v.invested > 0 ? (v.profit / v.invested) * 100 : 0;
    return { year, profitPercent: pct, invested: v.invested, profit: v.profit, current: v.current };
  });

  const investedVsProfitByYear = byYear.map(({ year, invested, profit }) => ({
    year: String(year),
    investido: Math.round(invested * 100) / 100,
    lucro: Math.round(profit * 100) / 100,
  }));

  type Part = { units: number; invested: number; current: number };
  type LotRow = { openedAt: string | null; broker: string; product: string | null; units: number; invested: number; current: number };
  const emptyPart = (): Part => ({ units: 0, invested: 0, current: 0 });
  const tickerMap = new Map<
    string,
    Part & {
      name: string | null;
      category: string | null;
      brokers: Map<string, Part>;
      lots: LotRow[];
    }
  >();
  for (const a of assets) {
    const broker = a.broker ?? "XTB";
    const cur = tickerMap.get(a.ticker) ?? { name: a.name, category: a.category, ...emptyPart(), brokers: new Map<string, Part>(), lots: [] as LotRow[] };
    // Cada compra (lote ainda aberto), para as sublinhas da tabela
    cur.lots.push({
      openedAt: a.openedAt?.toISOString() ?? null,
      broker,
      product: a.product,
      units: a.quantity,
      invested: a.investedValue,
      current: a.currentValue,
    });
    cur.units += a.quantity;
    cur.invested += a.investedValue;
    cur.current += a.currentValue;
    const part = cur.brokers.get(broker) ?? emptyPart();
    part.units += a.quantity;
    part.invested += a.investedValue;
    part.current += a.currentValue;
    cur.brokers.set(broker, part);
    tickerMap.set(a.ticker, cur);
  }
  const byTicker = Array.from(tickerMap.entries())
    .map(([ticker, v]) => ({
      ticker,
      name: v.name,
      category: v.category,
      units: v.units,
      invested: v.invested,
      current: v.current,
      brokers: [...v.brokers.entries()].map(([broker, p]) => ({ broker, ...p })).sort((a, b) => a.broker.localeCompare(b.broker)),
      lots: v.lots.sort((a, b) => (a.openedAt ?? "").localeCompare(b.openedAt ?? "")),
    }))
    .sort((a, b) => b.current - a.current);

  // Totais por corretora
  const brokerMap = new Map<string, Part & { positions: Set<string> }>();
  for (const a of assets) {
    const broker = a.broker ?? "XTB";
    const cur = brokerMap.get(broker) ?? { ...emptyPart(), positions: new Set<string>() };
    cur.units += a.quantity;
    cur.invested += a.investedValue;
    cur.current += a.currentValue;
    cur.positions.add(a.ticker);
    brokerMap.set(broker, cur);
  }
  const byBroker = [...brokerMap.entries()]
    .map(([broker, v]) => ({
      broker,
      positions: v.positions.size,
      invested: v.invested,
      current: v.current,
      profit: v.current - v.invested,
      profitPercent: v.invested > 0 ? ((v.current - v.invested) / v.invested) * 100 : 0,
      weight: totalCurrent > 0 ? (v.current / totalCurrent) * 100 : 0,
    }))
    .sort((a, b) => b.current - a.current);

  const indexGroupMap = new Map<string, { invested: number; current: number; units: number }>();
  for (const a of assets) {
    const groupName = a.category === "STOCK" ? "Ações individuais" : getDisplayNameForTicker(a.ticker);
    const cur = indexGroupMap.get(groupName) ?? { invested: 0, current: 0, units: 0 };
    cur.invested += a.investedValue;
    cur.current += a.currentValue;
    cur.units += a.quantity;
    indexGroupMap.set(groupName, cur);
  }
  const byIndexGroup = Array.from(indexGroupMap.entries())
    .map(([name, v]) => ({
      name,
      value: totalCurrent > 0 ? (v.current / totalCurrent) * 100 : 0,
      current: v.current,
      invested: v.invested,
      units: v.units,
    }))
    .sort((a, b) => b.value - a.value);

  return NextResponse.json({
    hasInvestmentPlans: planAssets > 0,
    available,
    byBroker,
    summary,
    byCategory,
    byYear,
    investedVsProfitByYear,
    byTicker,
    byIndexGroup,
  });
}
