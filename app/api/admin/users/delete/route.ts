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

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId;
  if (!userId) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if ((target.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Cannot delete admin user" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
