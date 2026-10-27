import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/authContext.js";
import { getErrorMessage } from "../lib/api.js";
import CodeInput from "./CodeInput.jsx";
import { Button } from "./Button.jsx";

// Segunda etapa do login: a senha já foi aceita e falta o código do aplicativo autenticador
// (ou um código de recuperação). `onExpired` volta para a senha quando o desafio morreu.
export default function TwoFactorStep({ challenge, onDone, onBack, onExpired }) {
  const { signinTwoFactor } = useAuth();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  // Depois de um erro ou de trocar de modo, o foco volta para o campo (o botão desligado o tirava).
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy, recovery, error]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!recovery && !/^\d{6}$/.test(code)) return setError("Digite os 6 dígitos do aplicativo.");
    if (recovery && code.replace(/[\s-]/g, "").length < 10) return setError("Digite o código de recuperação completo.");
    setBusy(true);
    try {
      await signinTwoFactor(challenge, code);
      onDone();
    } catch (err) {
      // Só "código errado" deixa tentar de novo aqui; desafio vencido, esgotado ou conta travada voltam para a senha.
      if (err.response?.data?.code !== "wrong_code") return onExpired(getErrorMessage(err));
      setError(getErrorMessage(err));
      setCode("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-muted">
        {recovery ? "Digite um dos códigos de recuperação que você guardou. Cada um vale uma vez." : "Abra o aplicativo autenticador no celular e digite o código de 6 dígitos do CoreWallet."}
      </p>
      <CodeInput id="second-factor" label={recovery ? "Código de recuperação" : "Código do aplicativo"} value={code} onChange={setCode} recovery={recovery} error={error} autoFocus inputRef={inputRef} />
      <Button type="submit" disabled={busy}>
        {busy ? "Confirmando…" : "Confirmar"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setRecovery((r) => !r);
            setCode("");
            setError("");
          }}
          className="rounded-md px-1 py-0.5 font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700"
        >
          {recovery ? "Usar o código do aplicativo" : "Perdi o acesso ao aplicativo"}
        </button>
        <button type="button" onClick={onBack} className="rounded-md px-1 py-0.5 font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
          Voltar
        </button>
      </div>
    </form>
  );
}
