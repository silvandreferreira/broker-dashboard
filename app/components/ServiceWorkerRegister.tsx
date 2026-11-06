"use client";

import { useEffect } from "react";

/** Regista o service worker da PWA (só em produção, para não interferir com o dev server). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
      console.error("[sw] registo falhou", e);
    });
  }, []);
  return null;
}
