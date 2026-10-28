import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailTokenSchema } from "@corewallet/shared";
import { api, getErrorMessage } from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import Icon from "../components/Icon.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { Button } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";

const passwordOnly = emailTokenSchema.pick({ password: true });

// Página aberta pelo link do email de confirmação. O link sozinho não confirma: pede a senha da conta,
// porque quem recebe um link por um cadastro que não fez não conhece a senha que o outro escolheu.
export default function VerifyEmail() {
  usePageTitle("Confirmar email");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // O token fica só na memória: sai da barra de endereço e do histórico do navegador.
  const [token] = useState(() => params.get("token") ?? "");
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState(token ? null : { message: "Este link está incompleto. Abra de novo o link do email (ele continua valendo).", fatal: true });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(passwordOnly, undefined, { raw: true }), defaultValues: { password: "" } });

  useEffect(() => {
    if (token) navigate("/verify-email", { replace: true });
  }, [token, navigate]);

  async function onSubmit({ password }) {
    setProblem(null);
    try {
      await api.post("/auth/email/verify", { token, password });
      setDone(true);
    } catch (error) {
      // Só "link inválido" (400) encerra. Senha errada, limite de pedidos e falha de rede não gastam o link: dá para tentar de novo.
      setProblem({ message: getErrorMessage(error), fatal: error.response?.status === 400 });
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-pine-900">Confirmar email</h1>
      {done && (
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
      {!done && token && !problem?.fatal && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 flex flex-col gap-4">
          <p className="text-muted">Digite a senha que foi escolhida ao criar a conta para confirmar o email. Se você não criou uma conta no CoreWallet, ignore o email e feche esta página.</p>
          {problem && <ErrorMessage>{problem.message}</ErrorMessage>}
          <PasswordField label="Senha da conta" name="password" autoComplete="current-password" register={register} error={errors.password} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Confirmando…" : "Confirmar email"}
          </Button>
        </form>
      )}
      {!done && problem?.fatal && (
        <>
          <div className="mt-5">
            <ErrorMessage>{problem.message}</ErrorMessage>
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
