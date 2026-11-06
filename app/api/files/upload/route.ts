import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseXtbOpenPositions } from "@/lib/xtbParser";
import type { Session } from "next-auth";

export async function POST(req: NextRequest) {
  const session: Session | null = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(session.user.email);
  if (!isAdmin && session.user.accessApproved !== true) {
    return NextResponse.json({ error: "Access pending approval" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ficheiro em falta" }, { status: 400 });
  }

  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (!isXlsx) {
    return NextResponse.json(
      { error: "Apenas ficheiros .xlsx são suportados (exportação XTB)" },
      { status: 400 },
    );
  }

  const buffer = await file.arrayBuffer();
  let parsed;
  try {
    parsed = parseXtbOpenPositions(buffer);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o ficheiro XLSX." },
      { status: 400 },
    );
  }
  const { rows, skippedTickers } = parsed;

  if (rows.length === 0) {
    const reason =
      parsed.error ??
      (skippedTickers.length > 0
        ? `Nenhum ETF encontrado (ignorados: ${skippedTickers.join(", ")}).`
        : "Nenhuma posição aberta encontrada.");
    return NextResponse.json(
      {
        error: `XLSX sem dados: ${reason} Exporta o relatório do Histórico do xStation 5 em Excel (.xlsx).`,
      },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Utilizador não encontrado" },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.uploadedFile.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });

    const uploadedFile = await tx.uploadedFile.create({
      data: {
        fileName: file.name,
        userId: user.id,
        isActive: true,
        reportDate: parsed.reportDate ?? null,
      },
    });

    await tx.asset.createMany({
      data: rows.map((r) => ({
        fileId: uploadedFile.id,
        ticker: r.ticker,
        name: r.name ?? null,
        category: r.category ?? null,
        type: r.type,
        quantity: r.quantity,
        avgPrice: r.avgPrice ?? null,
        investedValue: r.investedValue,
        currentValue: r.currentValue,
        profitLoss: r.profitLoss,
        year: r.year ?? null,
        openedAt: r.openedAt ?? null,
        product: r.product,
      })),
    });

    return uploadedFile;
  });

  return NextResponse.json({
    fileId: created.id,
    rows: rows.length,
    skippedTickers,
    investmentPlanLots: parsed.investmentPlanLots,
  });
}
