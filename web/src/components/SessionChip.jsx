import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useAuth } from "../context/authContext.js";
import { connectionState } from "../lib/connection.js";
import { timeLeftLabel } from "../lib/time.js";
import Icon from "./Icon.jsx";
import { Button } from "./Button.jsx";
import ErrorMessage from "./ErrorMessage.jsx";

const CONNECTION = {
  https: { label: "HTTPS, criptografada", warn: false },
  local: { label: "Neste computador", warn: false },
  insecure: { label: "Sem HTTPS", warn: true },
};

// Selo "Sessão protegida" no topo. Ao abrir mostra o que é verdade agora:
// quem está logado, quando a sessão começou, quando vence e como a conexão chegou.
// É um botão que mostra e esconde um painel (disclosure), não um diálogo modal.
export default function SessionChip() {
  const { user, session, logout, now } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [logoutError, setLogoutError] = useState("");
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  const connection = connectionState(window.location);
  const warn = CONNECTION[connection].warn;
  const chipText = warn ? "Conexão sem HTTPS" : "Sessão protegida";

  useEffect(() => {
    if (!open) return undefined;
    const tick = setInterval(() => setTick((n) => n + 1), 15000);
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    // Fecha ao clicar fora e também quando o foco sai do painel (Tab para fora).
    const onOutside = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      clearInterval(tick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout();
      navigate("/signin", { replace: true });
    } catch {
      setLogoutError("Não foi possível sair agora. Sua sessão continua aberta. Tente de novo.");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? "session-details" : undefined}
        className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium transition sm:px-3.5 ${
          warn ? "bg-coral-100 text-coral-800 hover:bg-coral-100/70" : "bg-mint-100 text-pine-900 hover:bg-mint-300/50"
        } [--icon-accent:currentColor]`}
      >
        <Icon name={warn ? "aviso" : "escudo"} className="size-5" />
        <span className="sr-only sm:not-sr-only">{chipText}</span>
      </button>

      {open && (
        <div
          id="session-details"
          role="group"
          aria-label="Detalhes da sessão"
          className="absolute right-0 z-10 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-4 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-pine-900 font-semibold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{user?.name}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
            </div>
          </div>

          <dl className="mt-4 flex flex-col gap-2.5 border-t border-line pt-3 text-sm">
            {session && (
              <>
                <Row label="Sessão iniciada" value={dayjs(session.startedAt).format("HH:mm")} />
                <Row label="Vence em" value={timeLeftLabel(session.expiresAt, now())} />
              </>
            )}
            <Row label="Conexão" value={CONNECTION[connection].label} warn={warn} />
          </dl>

          {logoutError && (
            <div className="mt-3">
              <ErrorMessage>{logoutError}</ErrorMessage>
            </div>
          )}

          <div className="mt-4">
            <Button variant="soft" icon="sair" onClick={handleLogout}>
              Sair
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, warn }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium ${warn ? "text-negative" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
