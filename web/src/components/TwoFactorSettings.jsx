import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "./Icon.jsx";
import CodeInput from "./CodeInput.jsx";
import PasswordField from "./PasswordField.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import { Button } from "./Button.jsx";
import { useForm } from "react-hook-form";

const group4 = (secret) => secret.match(/.{1,4}/g).join(" ");

// "Verificação em duas etapas" na tela da conta: ativar com um aplicativo autenticador (Google
// Authenticator, Authy, 1Password…), guardar os códigos de recuperação e desativar.
export default function TwoFactorSettings() {
  const { user, expire } = useAuth();
  const [status, setStatus] = useState(null); // { enabled, recoveryCodesLeft } | { error }
  const [mode, setMode] = useState("idle"); // idle | password | setup | codes | disabling
  const [setup, setSetup] = useState(null); // { secret, qr }
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus((await api.get("/auth/2fa")).data);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setStatus({ error: getErrorMessage(err) });
    }
  }, [expire]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/2fa")
      .then((res) => !cancelled && setStatus(res.data))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) expire();
        else setStatus({ error: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [expire]);

  const heading = (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-mint-100 text-pine-900 [--icon-accent:var(--color-coral-500)]">
        <Icon name="escudo" className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-pine-900">Verificação em duas etapas</h2>
        <p className="text-sm text-muted">Além da senha, o login pede um código de 6 dígitos que muda a cada 30 segundos, gerado por um aplicativo no seu celular.</p>
      </div>
    </div>
  );

  let body;
  // Os códigos de recuperação aparecem uma única vez: nada pode escondê-los antes de a pessoa confirmar
  // que guardou (nem um erro ao recarregar o estado).
  if (mode === "codes") {
    body = (
      <RecoveryCodes
        codes={recoveryCodes}
        onDone={() => {
          setRecoveryCodes([]);
          setMode("idle");
          setNotice("Verificação em duas etapas ativada.");
          load();
        }}
      />
    );
  } else if (user?.provider === "google") {
    body = <p className="mt-4 text-sm text-muted">Você entra pelo Google. Para ter duas etapas, ative a verificação em duas etapas na sua conta Google.</p>;
  } else if (!status) {
    body = (
      <p role="status" className="mt-4 text-sm text-muted">
        Carregando…
      </p>
    );
  } else if (status.error) {
    body = (
      <div className="mt-4">
        <ErrorMessage>{status.error}</ErrorMessage>
      </div>
    );
  } else if (mode === "password") {
    body = (
      <AskPassword
        expire={expire}
        onCancel={() => setMode("idle")}
        onReady={(data) => {
          setSetup(data);
          setMode("setup");
        }}
      />
    );
  } else if (mode === "setup") {
    body = (
      <Setup
        data={setup}
        expire={expire}
        onCancel={() => setMode("idle")}
        onEnabled={(codes) => {
          setRecoveryCodes(codes);
          setMode("codes");
        }}
      />
    );
  } else if (mode === "disabling") {
    body = (
      <Disable
        expire={expire}
        onCancel={() => setMode("idle")}
        onDisabled={() => {
          setMode("idle");
          setNotice("Verificação em duas etapas desativada.");
          load();
        }}
      />
    );
  } else if (status.enabled) {
    body = (
      <div className="mt-4 flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-pine-900 [--icon-accent:currentColor]">
          <Icon name="ok" className="size-5 shrink-0" />
          Ativa. Códigos de recuperação restantes: {status.recoveryCodesLeft}
        </p>
        {status.recoveryCodesLeft <= 2 && (
          <p className="text-sm text-coral-800">Poucos códigos de recuperação sobrando. Desative e ative de novo para gerar 10 novos.</p>
        )}
        <div>
          <Button variant="soft" onClick={() => setMode("disabling")} inline>
            Desativar
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="mt-4">
        <Button
          variant="pine"
          inline
          onClick={() => {
            setNotice("");
            setMode("password");
          }}
        >
          Ativar
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Verificação em duas etapas" className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
      {heading}
      {notice && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-md bg-mint-100 p-3 text-sm text-pine-900">
          <Icon name="ok" className="size-5 shrink-0" />
          {notice}
        </p>
      )}
      {body}
    </section>
  );
}

// Antes de gerar o segredo, confirma a senha: uma sessão aberta sozinha não registra um aplicativo.
function AskPassword({ expire, onCancel, onReady }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm({ defaultValues: { password: "" } });

  async function submit({ password }) {
    setError("");
    if (!password) return setFieldError("password", { message: "A senha é obrigatória" });
    setBusy(true);
    try {
      onReady((await api.post("/auth/2fa/setup", { password })).data);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      const fieldError = err.response?.data?.errors?.password;
      if (fieldError) setFieldError("password", { message: fieldError });
      else setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-muted">Confirme sua senha para começar.</p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <PasswordField label="Senha" name="password" autoComplete="current-password" register={register} error={errors.password} />
      <div className="flex gap-2">
        <Button type="submit" variant="pine" disabled={busy} inline>
          {busy ? "Verificando…" : "Continuar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} inline>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Setup({ data, expire, onCancel, onEnabled }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Digite os 6 dígitos do aplicativo.");
    setBusy(true);
    try {
      onEnabled((await api.post("/auth/2fa/enable", { code })).data.recoveryCodes);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setError(err.response?.data?.errors?.code ?? getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink">
        <li>Instale um aplicativo autenticador no celular (Google Authenticator, Authy, 1Password…).</li>
        <li>Escaneie o QR code abaixo, ou digite a chave à mão.</li>
        <li>Digite o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
        <img src={data.qr} alt="QR code para o aplicativo autenticador" width={176} height={176} className="size-44 rounded-md border border-line bg-white p-1" />
        <div className="min-w-0 text-sm">
          <p className="text-muted">Chave para digitar à mão:</p>
          <p className="tabular mt-1 font-mono text-base font-semibold tracking-wide text-pine-900 [overflow-wrap:anywhere]" aria-label="Chave de configuração">
            {group4(data.secret)}
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(data.secret);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="mt-1 rounded-md px-1 py-0.5 font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700"
          >
            {copied ? "Chave copiada" : "Copiar chave"}
          </button>
        </div>
      </div>
      <CodeInput id="enable-code" label="Código do aplicativo" value={code} onChange={setCode} error={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="pine" disabled={busy} inline>
          {busy ? "Confirmando…" : "Confirmar e ativar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} inline>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p role="alert" className="rounded-md bg-coral-100 p-3 text-sm text-coral-800">
        <strong>Guarde estes 10 códigos agora.</strong> Se você perder o celular, cada um deixa entrar uma vez. Eles não aparecem de novo.
      </p>
      <ul aria-label="Códigos de recuperação" className="grid grid-cols-2 gap-2 rounded-md bg-canvas p-3 font-mono text-base font-semibold text-pine-900">
        {codes.map((c) => (
          <li key={c} className="tabular">
            {c}
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-md px-1 py-0.5 text-sm font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700"
        >
          {copied ? "Códigos copiados" : "Copiar os códigos"}
        </button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4" />
        Guardei os códigos em um lugar seguro.
      </label>
      <div>
        <Button variant="pine" disabled={!saved} onClick={onDone} inline>
          Concluir
        </Button>
      </div>
    </div>
  );
}

function Disable({ expire, onCancel, onDisabled }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm({ defaultValues: { password: "" } });

  async function submit({ password }) {
    setError("");
    if (!code.trim()) return setError("Digite o código.");
    setBusy(true);
    try {
      await api.post("/auth/2fa/disable", { password, code });
      onDisabled();
    } catch (err) {
      if (err.response?.status === 401) return expire();
      const fields = err.response?.data?.errors ?? {};
      if (fields.password) setFieldError("password", { message: fields.password });
      if (fields.code) setError(fields.code);
      if (!fields.password && !fields.code) setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-muted">Para desativar, confirme a senha e um código (do aplicativo ou de recuperação).</p>
      <PasswordField label="Senha" name="password" autoComplete="current-password" register={register} error={errors.password} />
      <CodeInput id="disable-code" label={recovery ? "Código de recuperação" : "Código do aplicativo"} value={code} onChange={setCode} recovery={recovery} error={error} />
      <button
        type="button"
        onClick={() => {
          setRecovery((r) => !r);
          setCode("");
        }}
        className="w-fit rounded-md px-1 py-0.5 text-sm font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700"
      >
        {recovery ? "Usar o código do aplicativo" : "Usar um código de recuperação"}
      </button>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy} inline>
          {busy ? "Desativando…" : "Desativar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} inline>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
