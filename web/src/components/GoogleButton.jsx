import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { loadScript } from "../lib/loadScript.js";

const SCRIPT = "https://accounts.google.com/gsi/client";
// O nonce vale 5 minutos na API; renovamos antes disso, e ao voltar para a aba.
const REFRESH_EVERY_MS = 4 * 60 * 1000;

// Dois pedidos de nonce ao mesmo tempo (o React em desenvolvimento monta o
// componente duas vezes) fariam o segundo cookie apagar o primeiro. Quem chega
// no meio do pedido reaproveita a resposta que já está a caminho.
let nonceInFlight = null;
function fetchNonce() {
  if (!nonceInFlight) {
    nonceInFlight = api
      .get("/auth/google/nonce")
      .then((res) => res.data.nonce)
      .finally(() => {
        nonceInFlight = null;
      });
  }
  return nonceInFlight;
}

// Botão "Continuar com o Google". A cada uso pede um nonce novo à API: ele vai
// dentro do token do Google, e a API só aceita o token se o nonce combinar com o
// cookie deste navegador. onCredential recebe o token e deve lançar erro se o login falhar.
export default function GoogleButton({ clientId, onCredential }) {
  const box = useRef(null);
  const onCredentialRef = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  });

  useEffect(() => {
    let cancelled = false;
    let lastSetup = 0;

    async function setup() {
      try {
        const [, nonce] = await Promise.all([loadScript(SCRIPT), fetchNonce()]);
        if (cancelled || !box.current || !window.google?.accounts?.id) return;
        lastSetup = Date.now();
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce,
          ux_mode: "popup",
          auto_select: false,
          callback: async (response) => {
            try {
              await onCredentialRef.current(response.credential);
            } catch {
              // O erro já é mostrado por quem chamou. Aqui só renovamos o nonce.
            } finally {
              if (!cancelled) setup();
            }
          },
        });
        box.current.replaceChildren();
        window.google.accounts.id.renderButton(box.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          locale: "pt-BR",
          width: Math.min(Math.max(box.current.clientWidth || 320, 200), 400),
        });
      } catch {
        // Na renovação, se falhar, o botão que já está na tela continua; só o
        // primeiro carregamento mostra o aviso.
        if (!cancelled && lastSetup === 0) setFailed(true);
      }
    }

    // Quem deixa a página aberta e volta depois não pode encontrar um nonce vencido.
    const refreshIfStale = () => {
      if (!cancelled && lastSetup && Date.now() - lastSetup >= REFRESH_EVERY_MS) setup();
    };
    const timer = setInterval(refreshIfStale, 30 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);

    setup();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clientId]);

  if (failed) {
    return (
      <p role="alert" className="rounded-xl bg-coral-100 p-3 text-sm text-coral-800">
        Não foi possível carregar o login com o Google. Use o email e a senha, ou recarregue a página.
      </p>
    );
  }
  return <div ref={box} className="flex min-h-11 justify-center" aria-label="Entrar com o Google" />;
}
