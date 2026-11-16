import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { BROKERS, rebuildT212Assets } from "@/lib/brokerDocuments";

/**
 * POST /api/files/documents/delete { documentId }
 * Remove um documento de uma corretora da entrada. Se for o último, a entrada é apagada.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;

  const body = (await req.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = body?.documentId;
  if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

  const doc = await prisma.brokerDocument.findFirst({
    where: { id: documentId, file: { userId: auth.userId } },
    select: { id: true, broker: true, fileId: true, file: { select: { _count: { select: { documents: true } } } } },
  });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });

  if (doc.file._count.documents <= 1) {
    return NextResponse.json({ error: "É o único documento desta entrada: apaga a entrada inteira." }, { status: 400 });
  }

  // Os ativos XTB do documento saem em cascata; os T212 são recalculados com os CSV que sobram.
  await prisma.brokerDocument.delete({ where: { id: doc.id } });
  if (doc.broker === BROKERS.T212) await rebuildT212Assets(doc.fileId);
  if (doc.broker === BROKERS.XTB) {
    await prisma.uploadedFile.update({ where: { id: doc.fileId }, data: { reportDate: null } });
  }
  return NextResponse.json({ ok: true, fileId: doc.fileId });
}
