import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
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

  const body = (await req.json().catch(() => null)) as { fileId?: string } | null;
  const fileId = body?.fileId;
  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }

  const file = await prisma.uploadedFile.findFirst({
    where: { id: fileId, userId: user.id },
    select: { id: true },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.asset.deleteMany({ where: { fileId } });
    await tx.uploadedFile.delete({ where: { id: fileId } });

    const latest = await tx.uploadedFile.findFirst({
      where: { userId: user.id },
      orderBy: { uploadedAt: "desc" },
      select: { id: true },
    });

    if (latest) {
      await tx.uploadedFile.updateMany({
        where: { userId: user.id },
        data: { isActive: false },
      });
      await tx.uploadedFile.update({
        where: { id: latest.id },
        data: { isActive: true },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

