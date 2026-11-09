import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/apiAuth";
import { sendPushToUser } from "@/lib/push";

/** POST /api/push/test — notificação de teste para todos os dispositivos do utilizador. */
export async function POST() {
  const auth = await requireApprovedUser();
  if (auth.error) return auth.error;
  const result = await sendPushToUser(auth.userId, {
    title: "Finanza: teste",
    body: "As notificações estão a funcionar. Vais receber um alerta se algum ETF cair mais de 10%.",
    url: "/",
    tag: "test",
  });
  return NextResponse.json(result);
}
