import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

/** POST /api/push/subscribe { endpoint, keys: { p256dh, auth } } — guardar este dispositivo. */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const authKey = body?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof p256dh !== "string" || typeof authKey !== "string") {
    return NextResponse.json({ error: "Subscrição inválida" }, { status: 400 });
  }
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth: authKey, userAgent, userId: auth.userId },
    update: { p256dh, auth: authKey, userAgent, userId: auth.userId },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/subscribe { endpoint } — deixar de receber neste dispositivo. */
export async function DELETE(req: NextRequest) {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== "string") {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: auth.userId } });
  return NextResponse.json({ ok: true });
}
