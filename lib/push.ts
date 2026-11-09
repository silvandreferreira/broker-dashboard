import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys em falta (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://broker-dashboard-bice.vercel.app",
    publicKey,
    privateKey,
  );
  configured = true;
}

/**
 * Envia a notificação para todos os dispositivos do utilizador.
 * Subscrições que já não existem (404/410) são apagadas.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  configure();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
        else console.error("[push]", status, e);
      }
    }),
  );
  if (expired.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  return { devices: subs.length, sent, expired: expired.length };
}
