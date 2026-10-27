import { useEffect, useRef, useState } from "react";
import { loadScript } from "../lib/loadScript.js";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Captcha da Cloudflare (Turnstile). Chama onToken com o token quando a pessoa
// passa, e com "" quando ele expira ou dá erro. Cada token vale uma única vez:
// depois de enviar o formulário, mude resetKey para pedir um novo.
export default function Turnstile({ siteKey, onToken, resetKey = 0 }) {
  const box = useRef(null);
  const widgetId = useRef(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    let cancelled = false;
    loadScript(SCRIPT)
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: "light",
          language: "pt-br",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onTokenRef.current("");
    if (widgetId.current !== null && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  if (failed) {
    return (
      <p role="alert" className="rounded-md bg-coral-100 p-3 text-sm text-coral-800">
        Não foi possível carregar a verificação de segurança. Confira a internet, desative bloqueadores para este site e recarregue a página.
      </p>
    );
  }
  return <div ref={box} className="min-h-[65px]" aria-label="Verificação de segurança" />;
}
