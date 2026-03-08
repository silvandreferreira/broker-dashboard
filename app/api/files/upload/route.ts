import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

type AssetRow = {
  ticker: string;
  name?: string;
  category?: string;
  type: string;
  quantity: number;
  avgPrice?: number;
  investedValue: number;
  currentValue: number;
  profitLoss: number;
  year?: number;
};

function parseNumber(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const s = String(value ?? "").trim().replace(/^[$€\s]+/g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (row.some((c) => String(c).trim().toLowerCase() === "symbol")) return i;
  }
  return -1;
}

function getColumnIndex(headerRow: unknown[], name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i]).trim().toLowerCase() === lower) return i;
  }
  return -1;
}

function parseXlsxToRows(buffer: ArrayBuffer): AssetRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => /open\s*position/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) return [];

  const headerRow = rows[headerRowIndex] as unknown[];
  const idx = (name: string) => getColumnIndex(headerRow, name);

  const symbolIdx = idx("Symbol");
  if (symbolIdx < 0) return [];

  const typeIdx = idx("Type");
  const volumeIdx = idx("Volume");
  const openPriceIdx = idx("Open price");
  const marketPriceIdx = idx("Market price");
  const purchaseValueIdx = idx("Purchase value");
  const grossPLIdx = idx("Gross P/L");
  const openTimeIdx = idx("Open time");

  const result: AssetRow[] = [];
  const currentYear = new Date().getFullYear();

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const ticker = String(row[symbolIdx] ?? "").trim();
    if (!ticker) continue;

    const quantity = parseNumber(row[volumeIdx]);
    if (quantity <= 0) continue;

    const openPrice = openPriceIdx >= 0 ? parseNumber(row[openPriceIdx]) : 0;
    const marketPrice = marketPriceIdx >= 0 ? parseNumber(row[marketPriceIdx]) : openPrice;
    const investedValue =
      purchaseValueIdx >= 0 ? parseNumber(row[purchaseValueIdx]) : quantity * openPrice;
    const currentValue = quantity * marketPrice;
    const profitLoss =
      grossPLIdx >= 0 ? parseNumber(row[grossPLIdx]) : currentValue - investedValue;
    const type =
      typeIdx >= 0 ? String(row[typeIdx] ?? "").trim() || "ETF" : "ETF";

    let year: number | undefined;
    if (openTimeIdx >= 0) {
      const raw = String(row[openTimeIdx] ?? "").trim();
      const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) year = Number(match[3]);
    }
    if (year == null) year = currentYear;

    result.push({
      ticker,
      type,
      quantity,
      avgPrice: openPrice || undefined,
      investedValue,
      currentValue,
      profitLoss,
      year,
    });
  }

  return result;
}

export async function POST(req: NextRequest) {
  const session: Session | null = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const rows = parseXlsxToRows(buffer);

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "XLSX sem dados. Exporta o relatório «Open Position» do XTB em formato Excel (.xlsx).",
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
      })),
    });

    return uploadedFile;
  });

  return NextResponse.json({ fileId: created.id });
}
