import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, getErrorMessage } from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import Icon from "../components/Icon.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";

// O mesmo link não pode ser consumido duas vezes (o React em modo de desenvolvimento roda o efeito
// duas vezes): a primeira chamada é guardada e reaproveitada.
const attempts = new Map();
function verify(token) {
  if (!attempts.has(token)) attempts.set(token, api.post("/auth/email/verify", { token }).then(() => ({ ok: true }), (err) => ({ ok: false, message: getErrorMessage(err) })));
  return attempts.get(token);
}

// Página aberta pelo link do email de confirmação.
export default function VerifyEmail() {
  usePageTitle("Confirmar email");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [result, setResult] = useState(token ? null : { ok: false, message: "Este link está incompleto. Abra o link do email de novo." });

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    verify(token).then((r) => {
      if (cancelled) return;
      setResult(r);
      // O token sai da barra de endereço e do histórico do navegador.
      navigate("/verify-email", { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-pine-900">Confirmar email</h1>
      {!result && (
        <p role="status" className="mt-5 text-muted">
          Confirmando…
        </p>
      )}
      {result?.ok && (
        <>
          <p role="status" className="mt-5 flex items-center gap-2 rounded-md bg-mint-100 p-3.5 text-pine-900">
            <Icon name="ok" className="size-5 shrink-0" />
            Email confirmado! Sua conta está ativa.
          </p>
          <Link to="/signin" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-pine-900 font-semibold text-white transition hover:bg-pine-800">
            Entrar
          </Link>
        </>
      )}
      {result && !result.ok && (
        <>
          <div className="mt-5">
            <ErrorMessage>{result.message}</ErrorMessage>
          </div>
          <p className="mt-4 text-sm text-muted">Entre com seu email e senha: se a conta ainda não estiver confirmada, a tela oferece um novo link.</p>
          <Link to="/signin" className="mt-4 inline-flex font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
            Ir para o login
          </Link>
        </>
      )}
    </div>
  );
}
