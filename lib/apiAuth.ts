import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";

/** Utilizador autenticado e aprovado, ou a resposta de erro a devolver. */
export async function requireApprovedUser(): Promise<
  { userId: string; error?: undefined } | { userId?: undefined; error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminEmail(email) && session.user.accessApproved !== true) {
    return { error: NextResponse.json({ error: "Access pending approval" }, { status: 403 }) };
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { error: NextResponse.json({ error: "User not found" }, { status: 400 }) };
  return { userId: user.id };
}
