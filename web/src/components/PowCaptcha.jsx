import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { solveChallenge } from "../lib/pow.js";
import Icon from "./Icon.jsx";

// Antes de o desafio vencer o navegador pede outro, para o token nunca chegar velho ao servidor.
const REFRESH_MARGIN_MS = 30_000;

// Verificação automática contra robôs: pequena, roda sozinha e não pede clique. Chama onToken com o
// token quando termina, e com "" enquanto trabalha. Cada token vale uma vez: depois de enviar o
// formulário, mude resetKey para pedir um novo.
export default function PowCaptcha({ onToken, resetKey = 0 }) {
  const [attempt, setAttempt] = useState(0);
  // Estável de propósito: o Solver reinicia o trabalho quando esta função muda, e uma função nova a
  // cada renderização reiniciaria (e apagaria o token) toda vez que a tela mudasse, por exemplo ao digitar.
  const restart = useCallback(() => setAttempt((n) => n + 1), []);
  return <Solver key={`${resetKey}:${attempt}`} onToken={onToken} onRestart={restart} />;
}

function Solver({ onToken, onRestart }) {
  const [status, setStatus] = useState("solving"); // solving | ready | error
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    const controller = new AbortController();
    let refresh;
    onTokenRef.current("");
    (async () => {
      try {
        const { data } = await api.get("/auth/challenge");
        const token = await solveChallenge(data, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setStatus("ready");
        onTokenRef.current(token);
        refresh = setTimeout(onRestart, Math.max(data.ttl * 1000 - REFRESH_MARGIN_MS, 5_000));
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setStatus("error");
      }
    })();
    return () => {
      controller.abort();
      clearTimeout(refresh);
    };
  }, [onRestart]);

  const base = "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm";
  if (status === "error") {
    return (
      <div role="alert" className={`${base} border-coral-500/40 bg-coral-100 text-coral-800`}>
        <Icon name="aviso" className="size-5 shrink-0 [--icon-accent:currentColor]" />
        Não foi possível verificar.
        <button type="button" onClick={onRestart} className="rounded px-1.5 py-0.5 font-semibold underline underline-offset-4 hover:bg-white/60">
          Tentar de novo
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className={`${base} border-line bg-white text-muted`}>
      {status === "ready" ? (
        <>
          <Icon name="ok" className="size-5 shrink-0 text-positive [--icon-accent:currentColor]" />
          <span className="text-ink">Verificado: você é uma pessoa</span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-pine-700 motion-reduce:animate-none" />
          Verificando que você é uma pessoa…
        </>
      )}
    </div>
  );
}
