import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { checkTickers } from "@/lib/marketAlerts";

/** GET /api/alerts/check — situação atual de cada ETF vigiado face ao máximo de 52 semanas. */
export async function GET() {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const watches = await prisma.alertWatch.findMany({
    where: { userId: auth.userId },
    select: { ticker: true },
  });
  const results = await checkTickers(watches.map((w) => w.ticker));
  return NextResponse.json({ checkedAt: new Date().toISOString(), results });
}
