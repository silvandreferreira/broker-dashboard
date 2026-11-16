import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { parseXtbOpenPositions } from "@/lib/xtbParser";
import { looksLikeT212, parseT212Csv } from "@/lib/t212Parser";
import { BROKERS, rebuildT212Assets } from "@/lib/brokerDocuments";

/**
 * POST /api/files/upload  (multipart: file, entryId?)
 *
 * - Sem `entryId`: cria uma entrada nova com este documento.
 * - Com `entryId`: junta o documento a uma entrada existente (outra corretora, ou mais
 *   um CSV da Trading 212 — as ordens repetidas são ignoradas).
 * A corretora é detetada pelo formato: .xlsx = XTB, .csv com cabeçalho Trading 212 = T212.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const formData = await req.formData();
  const file = formData.get("file");
  const entryId = String(formData.get("entryId") ?? "").trim() || null;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ficheiro em falta" }, { status: 400 });
  }

  const entry = entryId
    ? await prisma.uploadedFile.findFirst({
        where: { id: entryId, userId },
        select: { id: true, documents: { select: { broker: true } } },
      })
    : null;
  if (entryId && !entry) {
    return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 });
  }

  const name = file.name.toLowerCase();
  const isXlsx =
    name.endsWith(".xlsx") || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const isCsv = name.endsWith(".csv") || file.type === "text/csv";

  // ───────────── XTB ─────────────
  if (isXlsx) {
    if (entry?.documents.some((d) => d.broker === BROKERS.XTB)) {
      return NextResponse.json(
        { error: "Esta entrada já tem um relatório XTB. Cria uma entrada nova ou apaga primeiro o XTB desta." },
        { status: 400 },
      );
    }
    let parsed;
    try {
      parsed = parseXtbOpenPositions(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "Não foi possível ler o ficheiro XLSX." }, { status: 400 });
    }
    const { rows, skippedTickers } = parsed;
    if (rows.length === 0) {
      const reason =
        parsed.error ??
        (skippedTickers.length > 0
          ? `Nenhum ETF ou ação encontrado (ignorados: ${skippedTickers.join(", ")}).`
          : "Nenhuma posição aberta encontrada.");
      return NextResponse.json(
        { error: `XLSX sem dados: ${reason} Exporta o relatório do Histórico do xStation 5 em Excel (.xlsx).` },
        { status: 400 },
      );
    }

    const fileId = await prisma.$transaction(async (tx) => {
      let id = entry?.id;
      if (!id) {
        await tx.uploadedFile.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
        id = (
          await tx.uploadedFile.create({
            data: { fileName: file.name, userId, isActive: true, reportDate: parsed.reportDate ?? null },
          })
        ).id;
      } else {
        // A data do relatório XTB passa a ser a data da entrada
        await tx.uploadedFile.update({ where: { id }, data: { reportDate: parsed.reportDate ?? null } });
      }
      const doc = await tx.brokerDocument.create({
        data: { fileId: id, broker: BROKERS.XTB, fileName: file.name, reportDate: parsed.reportDate ?? null },
      });
      await tx.asset.createMany({
        data: rows.map((r) => ({
          fileId: id!,
          documentId: doc.id,
          broker: BROKERS.XTB,
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
      return id;
    });

    return NextResponse.json({
      fileId,
      broker: BROKERS.XTB,
      rows: rows.length,
      skippedTickers,
      investmentPlanLots: parsed.investmentPlanLots,
      warnings: skippedTickers.length ? [`Ignorados (não são ETF nem ação): ${skippedTickers.join(", ")}.`] : [],
    });
  }

  // ───────────── Trading 212 ─────────────
  if (isCsv) {
    const text = await file.text();
    if (!looksLikeT212(text)) {
      return NextResponse.json(
        { error: "CSV não reconhecido. Exporta o histórico da Trading 212 (Histórico → Exportar → CSV)." },
        { status: 400 },
      );
    }
    const parsed = parseT212Csv(text);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.transactions.length === 0) {
      return NextResponse.json({ error: "O CSV não tem ordens de compra ou venda." }, { status: 400 });
    }

    // Ordens já carregadas noutros CSV desta entrada
    let duplicates = 0;
    if (entry) {
      const existing = await prisma.brokerDocument.findMany({
        where: { fileId: entry.id, broker: BROKERS.T212 },
        select: { transactions: true },
      });
      const seen = new Set(
        existing.flatMap((d) => ((d.transactions as { id: string }[] | null) ?? []).map((t) => t.id)),
      );
      duplicates = parsed.transactions.filter((t) => seen.has(t.id)).length;
    }

    const now = new Date();
    const fileId = await prisma.$transaction(async (tx) => {
      let id = entry?.id;
      if (!id) {
        await tx.uploadedFile.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
        id = (await tx.uploadedFile.create({ data: { fileName: file.name, userId, isActive: true, reportDate: now } })).id;
      }
      await tx.brokerDocument.create({
        data: { fileId: id, broker: BROKERS.T212, fileName: file.name, reportDate: now, transactions: parsed.transactions },
      });
      return id;
    });

    const rebuilt = await rebuildT212Assets(fileId);
    const warnings: string[] = [];
    if (duplicates) warnings.push(`${duplicates} ordens já estavam carregadas e foram ignoradas.`);
    if (rebuilt.unmatchedSells.length) {
      warnings.push(
        `Vendas sem compra no ficheiro (posições já fechadas, ignoradas): ${rebuilt.unmatchedSells.map((u) => u.ticker).join(", ")}.`,
      );
    }
    if (rebuilt.noPrice.length) {
      warnings.push(`Sem cotação no Yahoo (valor = investido): ${rebuilt.noPrice.join(", ")}.`);
    }
    return NextResponse.json({
      fileId,
      broker: BROKERS.T212,
      transactions: parsed.transactions.length,
      positions: rebuilt.positions,
      warnings,
    });
  }

  return NextResponse.json(
    { error: "Formato não suportado: carrega o .xlsx da XTB ou o .csv da Trading 212." },
    { status: 400 },
  );
}
