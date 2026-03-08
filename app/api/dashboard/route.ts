import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDisplayNameForTicker } from "@/lib/etfIndexGroups";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let fileId = searchParams.get("fileId");

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
      byType: [],
      investedVsProfitByYear: [],
      investedAndAccByYear: [],
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

  const assets = await prisma.asset.findMany({
    where: { fileId, file: { userId: user.id } },
  });

  const totalUnits = assets.reduce((s, a) => s + a.quantity, 0);
  const totalInvested = assets.reduce((s, a) => s + a.investedValue, 0);
  const totalCurrent = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalProfit = totalCurrent - totalInvested;
  const profitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  const summary = {
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

  const typeMap = new Map<string, number>();
  for (const a of assets) {
    const t = (a.type && a.type.trim()) || "Outro";
    typeMap.set(t, (typeMap.get(t) ?? 0) + a.currentValue);
  }
  const byType = Array.from(typeMap.entries()).map(([type, value]) => ({
    type,
    value,
    percentage: totalCurrent > 0 ? (value / totalCurrent) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  const investedVsProfitByYear = byYear.map(({ year, invested, profit }) => ({
    year: String(year),
    investido: Math.round(invested * 100) / 100,
    lucro: Math.round(profit * 100) / 100,
  }));

  let cumInvested = 0;
  const accValue = Math.round(totalCurrent * 100) / 100;
  const investedAndAccByYear = years.map((year) => {
    const v = yearMap.get(year)!;
    cumInvested += v.invested;
    return {
      year: String(year),
      investidoAcumulado: Math.round(cumInvested * 100) / 100,
      acc: accValue,
    };
  });

  const tickerMap = new Map<string, { units: number; invested: number; current: number }>();
  for (const a of assets) {
    const cur = tickerMap.get(a.ticker) ?? { units: 0, invested: 0, current: 0 };
    cur.units += a.quantity;
    cur.invested += a.investedValue;
    cur.current += a.currentValue;
    tickerMap.set(a.ticker, cur);
  }
  const byTicker = Array.from(tickerMap.entries())
    .map(([ticker, v]) => ({ ticker, units: v.units, invested: v.invested, current: v.current }))
    .sort((a, b) => b.units - a.units);

  const indexGroupMap = new Map<string, { invested: number; current: number; units: number }>();
  for (const a of assets) {
    const groupName = getDisplayNameForTicker(a.ticker);
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
    summary,
    byCategory,
    byYear,
    byType,
    investedVsProfitByYear,
    investedAndAccByYear,
    byTicker,
    byIndexGroup,
  });
}
