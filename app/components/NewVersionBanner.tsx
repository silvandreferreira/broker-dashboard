"use client";

import { useEffect, useState } from "react";

const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Mostra uma barra quando há um deploy mais recente do que o código carregado neste separador.
 * Verifica ao voltar à app (foco / separador visível) e a cada 5 minutos.
 */
export function NewVersionBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!CURRENT_BUILD) return;
    let stopped = false;

    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId: string | null };
        if (!stopped && buildId && buildId !== CURRENT_BUILD) setAvailable(true);
      } catch {
        /* sem rede: tenta na próxima */
      }
    };

    const interval = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!available) return null;

  return (
    <div
      className="position-fixed bottom-0 start-50 translate-middle-x mb-3 px-3"
      style={{ zIndex: 1080, maxWidth: 520, width: "100%" }}
      role="status"
    >
      <div className="alert alert-primary shadow d-flex align-items-center justify-content-between gap-3 mb-0 py-2">
        <span className="small">
          <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
          Há uma versão nova da app.
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    </div>
  );
}
