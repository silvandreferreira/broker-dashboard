"use client";

import { useCallback, useEffect, useState } from "react";

type Watch = {
  ticker: string;
  name: string | null;
  enabled: boolean;
  alertedAt: string | null;
  inLatestFile: boolean;
};
type AlertsConfig = {
  thresholdPct: number;
  hours: number[];
  devices: number;
  sourceFile: { fileName: string; uploadedAt: string } | null;
  watches: Watch[];
};
type Check =
  | {
      ticker: string;
      ok: true;
      dropping: boolean;
      currency: string;
      price: number;
      high: number;
      highDate: string;
      changePct: number;
      priceTime: string;
    }
  | { ticker: string; ok: false; error: string };

type PushState =
  | "checking"
  | "unsupported"
  | "ios-install"
  | "denied"
  | "off"
  | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function getRegistration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", { scope: "/" }))
  );
}

const fmtNum = (n: number, digits = 2) =>
  n.toLocaleString("pt-PT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${fmtNum(n, 1)}%`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function AlertsPanel() {
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [checks, setChecks] = useState<Map<string, Check> | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "danger" | "info"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/alerts", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setConfig(await res.json());
  }, []);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/alerts/check", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { checkedAt: string; results: Check[] } = await res.json();
      setChecks(new Map(data.results.map((r) => [r.ticker, r])));
      setCheckedAt(data.checkedAt);
    } catch (e) {
      console.error(e);
      setError("Não foi possível obter as cotações agora.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then(() => {
        if (!cancelled) return runCheck();
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar a configuração dos alertas.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadConfig, runCheck]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let state: PushState;
      if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) {
        state = isIos() && !isStandalone() ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        state = "denied";
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        state = sub ? "on" : "off";
      }
      if (!cancelled) setPushState(state);
    })().catch(() => {
      if (!cancelled) setPushState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enablePush = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await getRegistration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPushState("on");
      setMessage({ kind: "success", text: "Notificações ativadas neste dispositivo." });
      await loadConfig();
    } catch (e) {
      console.error(e);
      setMessage({ kind: "danger", text: "Não foi possível ativar as notificações neste dispositivo." });
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushState("off");
      setMessage({ kind: "info", text: "Este dispositivo deixou de receber alertas." });
      await loadConfig();
    } catch (e) {
      console.error(e);
      setMessage({ kind: "danger", text: "Não foi possível desativar as notificações." });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r: { devices: number; sent: number } = await res.json();
      setMessage(
        r.sent > 0
          ? { kind: "success", text: `Notificação de teste enviada para ${r.sent} dispositivo(s).` }
          : { kind: "danger", text: "Nenhum dispositivo recebeu a notificação. Volta a ativar as notificações." },
      );
    } catch (e) {
      console.error(e);
      setMessage({ kind: "danger", text: "Falhou o envio da notificação de teste." });
    } finally {
      setBusy(false);
    }
  };

  const toggleWatch = async (ticker: string, enabled: boolean) => {
    setConfig((c) => c && { ...c, watches: c.watches.map((w) => (w.ticker === ticker ? { ...w, enabled } : w)) });
    const res = await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, enabled }),
    });
    if (!res.ok) {
      setConfig((c) => c && { ...c, watches: c.watches.map((w) => (w.ticker === ticker ? { ...w, enabled: !enabled } : w)) });
      setError(`Não foi possível guardar a alteração de ${ticker}.`);
    }
  };

  if (error && !config) return <div className="alert alert-danger">{error}</div>;
  if (!config) {
    return (
      <div className="d-flex align-items-center text-secondary py-4">
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        A carregar alertas...
      </div>
    );
  }

  const threshold = config.thresholdPct;
  const hoursText = config.hours.map((h) => `${h}h`).join(", ").replace(/, ([^,]*)$/, " e $1");
  const droppingNow = checks
    ? config.watches.filter((w) => {
        const c = checks.get(w.ticker);
        return w.enabled && c?.ok && c.dropping;
      })
    : [];

  return (
    <div>
      <p className="text-muted small">
        Em dias úteis, às {hoursText} (hora de Lisboa), a app verifica os ETFs ligados abaixo e envia uma
        notificação <strong>quando um ETF passa a estar mais de {threshold}% abaixo do máximo das últimas 52
        semanas</strong>. Cada queda só é avisada uma vez; o ETF volta a poder gerar alerta depois de recuperar para
        menos de 8% abaixo do máximo. A hora exata pode variar até 59 minutos.
      </p>

      {error && (
        <div className="alert alert-warning alert-dismissible small" role="alert">
          {error}
          <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setError(null)} />
        </div>
      )}

      <div className="card border mb-4">
        <div className="card-body">
          <h3 className="h6 mb-2">
            <i className="bi bi-bell me-2" />
            Notificações neste dispositivo
          </h3>
          {pushState === "checking" && <p className="small text-muted mb-0">A verificar...</p>}
          {pushState === "ios-install" && (
            <p className="small mb-0">
              No iPhone as notificações só funcionam na app instalada: no Safari toca em <strong>Partilhar</strong> e
              depois em <strong>Adicionar ao ecrã principal</strong>. Abre a app Finanza a partir do ícone e volta a
              este separador.
            </p>
          )}
          {pushState === "unsupported" && (
            <p className="small mb-0">Este browser não suporta notificações push.</p>
          )}
          {pushState === "denied" && (
            <p className="small mb-0">
              As notificações estão bloqueadas para esta app. Ativa-as nas definições do telemóvel (Definições →
              Notificações → Finanza) ou do browser e recarrega a página.
            </p>
          )}
          {(pushState === "off" || pushState === "on") && (
            <div className="d-flex flex-wrap align-items-center gap-2">
              {pushState === "on" ? (
                <>
                  <span className="badge text-bg-success">
                    <i className="bi bi-check-circle me-1" />
                    Ativas
                  </span>
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={sendTest} disabled={busy}>
                    <i className="bi bi-send me-1" />
                    Enviar teste
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={disablePush} disabled={busy}>
                    Desativar
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={enablePush} disabled={busy}>
                  <i className="bi bi-bell me-1" />
                  Ativar notificações
                </button>
              )}
              <span className="small text-muted">
                {config.devices === 0
                  ? "Nenhum dispositivo registado."
                  : `${config.devices} dispositivo(s) registado(s) na tua conta.`}
              </span>
            </div>
          )}
          {message && <div className={`alert alert-${message.kind} small mt-3 mb-0`}>{message.text}</div>}
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h3 className="h6 mb-0">
          <i className="bi bi-list-check me-2" />
          ETFs a vigiar
        </h3>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={runCheck} disabled={checking}>
          {checking ? (
            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
          ) : (
            <i className="bi bi-arrow-clockwise me-1" />
          )}
          Verificar agora
        </button>
      </div>
      <p className="small text-muted mb-2">
        {config.sourceFile
          ? `Lista criada a partir do último ficheiro carregado (${config.sourceFile.fileName}). ETFs novos em ficheiros futuros entram ligados.`
          : "Ainda não carregaste nenhum ficheiro."}
        {checkedAt && ` Cotações às ${new Date(checkedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}.`}
      </p>

      {checks && (
        <div className={`alert small py-2 ${droppingNow.length ? "alert-danger" : "alert-success"}`}>
          {droppingNow.length ? (
            <>
              <i className="bi bi-exclamation-triangle-fill me-1" />
              Em queda de mais de {threshold}% agora: {droppingNow.map((w) => w.ticker).join(", ")}.
            </>
          ) : (
            <>
              <i className="bi bi-check-circle-fill me-1" />
              Nenhum ETF ligado está mais de {threshold}% abaixo do máximo de 52 semanas.
            </>
          )}
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm align-middle small">
          <thead>
            <tr>
              <th scope="col">Alerta</th>
              <th scope="col">ETF</th>
              <th scope="col" className="text-end">Preço</th>
              <th scope="col" className="text-end">Máx. 52 sem.</th>
              <th scope="col" className="text-end">Face ao máx.</th>
            </tr>
          </thead>
          <tbody>
            {config.watches.map((w) => {
              const c = checks?.get(w.ticker);
              return (
                <tr key={w.ticker} className={w.enabled ? "" : "text-muted"}>
                  <td>
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id={`watch-${w.ticker}`}
                        checked={w.enabled}
                        onChange={(e) => toggleWatch(w.ticker, e.target.checked)}
                        aria-label={`Alertas para ${w.ticker}`}
                      />
                    </div>
                  </td>
                  <td>
                    <label htmlFor={`watch-${w.ticker}`} className="fw-semibold mb-0">
                      {w.ticker}
                    </label>
                    {w.name && <div className="text-muted text-truncate" style={{ maxWidth: 240 }}>{w.name}</div>}
                    {w.alertedAt && (
                      <span className="badge text-bg-light border me-1">
                        <i className="bi bi-bell-fill me-1" />
                        Avisado a {fmtDate(w.alertedAt)}
                      </span>
                    )}
                    {!w.inLatestFile && <span className="badge text-bg-light border">Não está no último ficheiro</span>}
                  </td>
                  {!c ? (
                    <td colSpan={3} className="text-end text-muted">
                      {checking ? "…" : "—"}
                    </td>
                  ) : !c.ok ? (
                    <td colSpan={3} className="text-end text-warning-emphasis">
                      Sem cotação
                    </td>
                  ) : (
                    <>
                      <td className="text-end text-nowrap">
                        {fmtNum(c.price)} {c.currency}
                      </td>
                      <td className="text-end text-nowrap">
                        {fmtNum(c.high)}
                        <div className="text-muted">{fmtDate(c.highDate)}</div>
                      </td>
                      <td className={`text-end text-nowrap fw-semibold ${c.dropping ? "text-danger" : ""}`}>
                        {c.dropping && <i className="bi bi-exclamation-triangle-fill me-1" aria-label="Em queda" />}
                        {fmtPct(c.changePct)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
