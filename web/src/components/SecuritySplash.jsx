import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import LogoMark from "./LogoMark.jsx";

const STATE_ICON = { done: "ok", active: "renovar", warn: "aviso", pending: "pendente" };
const STATE_TEXT = { done: "concluído", active: "em andamento", warn: "atenção", pending: "aguardando" };
const SLOW_AFTER_MS = 5000;

// Tela de carregamento de segurança. Cada passo mostrado corresponde a uma
// verificação que realmente está acontecendo (conexão, sessão, proteções).
// steps: [{ label, state: "done" | "active" | "warn" | "pending" }]
// fullScreen=false é a versão por cima da página (entrada com o Google): ela
// vira um diálogo modal, leva o foco para si e não deixa o Tab sair para a página de trás.
export default function SecuritySplash({ title = "Verificando com segurança", steps = [], fullScreen = true }) {
  const [slow, setSlow] = useState(false);
  const box = useRef(null);
  const modal = !fullScreen;

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!modal) return undefined;
    const previous = document.activeElement;
    box.current?.focus();
    const trap = (e) => {
      if (e.key === "Tab") e.preventDefault();
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [modal]);

  return (
    <div
      ref={box}
      tabIndex={modal ? -1 : undefined}
      role={modal ? "dialog" : "status"}
      aria-modal={modal ? "true" : undefined}
      aria-label={modal ? title : undefined}
      aria-live={modal ? undefined : "polite"}
      className={`on-dark grid place-items-center bg-pine-900 px-6 text-mint-50 outline-none ${fullScreen ? "min-h-screen" : "fixed inset-0 z-50"}`}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="relative grid size-32 place-items-center">
          <svg viewBox="0 0 128 128" className="absolute inset-0 size-full animate-spin [animation-duration:3.2s]" aria-hidden="true">
            <circle cx="64" cy="64" r="60" className="fill-none stroke-pine-700" strokeWidth="2" />
            <path d="M64 4 A60 60 0 0 1 124 64" className="fill-none stroke-coral-500" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <LogoMark tone="light" className="size-16" />
        </div>

        <div className="text-center">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-mint-300">{slow ? "Está demorando mais que o normal…" : "Isso leva só um instante."}</p>
        </div>

        <ul className="flex w-full flex-col gap-2.5" role={modal ? "status" : undefined} aria-live={modal ? "polite" : undefined}>
          {steps.map((s) => (
            <li
              key={s.label}
              className={`flex items-center gap-3 rounded-xl bg-pine-800/70 px-4 py-3 text-sm [--icon-accent:currentColor] ${
                s.state === "pending" ? "text-mint-300" : s.state === "warn" ? "text-coral-100" : "text-mint-50"
              }`}
            >
              <Icon name={STATE_ICON[s.state]} className={`size-5 shrink-0 ${s.state === "active" ? "animate-spin [animation-duration:1.4s]" : ""}`} />
              <span>
                {s.label}
                <span className="sr-only">{`: ${STATE_TEXT[s.state]}`}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
