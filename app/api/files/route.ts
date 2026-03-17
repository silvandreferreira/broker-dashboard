import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

export async function GET() {
  const session: Session | null = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(session.user.email);
  if (!isAdmin && session.user.accessApproved !== true) {
    return NextResponse.json({ error: "Access pending approval" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      files: {
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          uploadedAt: true,
          isActive: true,
          _count: {
            select: { assets: true },
          },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ files: [], activeFileId: null });
  }

  const active = user.files.find((f) => f.isActive) ?? user.files[0] ?? null;

  return NextResponse.json({
    files: user.files,
    activeFileId: active ? active.id : null,
  });
}

