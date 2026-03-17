import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail, ADMIN_EMAIL } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { userId?: string; approved?: boolean }
    | null;

  const userId = body?.userId;
  const approved = body?.approved;

  if (!userId || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if ((target.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Cannot change admin access" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      accessApproved: approved,
      accessApprovedAt: approved ? new Date() : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      accessApproved: true,
      accessRequestedAt: true,
      accessApprovedAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}

