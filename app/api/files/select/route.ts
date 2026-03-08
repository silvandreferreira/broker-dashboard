import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

export async function POST(req: NextRequest) {
  const session: Session | null = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await req.json();

  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 400 },
    );
  }

  const file = await prisma.uploadedFile.findFirst({
    where: { id: fileId, userId: user.id },
    select: { id: true },
  });

  if (!file) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.uploadedFile.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });

    await tx.uploadedFile.update({
      where: { id: fileId },
      data: { isActive: true },
    });
  });

  return NextResponse.json({ ok: true });
}

