import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signinSchema } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { useConfig } from "../context/configContext.js";
import { getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import Input from "../components/Input.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { Button } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import ProtectionDetails from "../components/ProtectionDetails.jsx";
import GoogleSection from "../components/GoogleSection.jsx";
import Captcha from "../components/Captcha.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";

export default function Signin() {
  const { signin, notice } = useAuth();
  const { captcha } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  usePageTitle("Entrar");
  const [apiError, setApiError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signinSchema, undefined, { raw: true }),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data) {
    setApiError("");
    if (captcha && !captchaToken) {
      setApiError(captcha.provider === "pow" ? "Aguarde a verificação de segurança terminar (leva poucos segundos) e tente de novo." : "Confirme que você não é um robô.");
      return;
    }
    try {
      await signin(captcha ? { ...data, captchaToken } : data);
      navigate("/", { replace: true });
    } catch (error) {
      setApiError(getErrorMessage(error));
      // O token do captcha vale uma vez só: depois de enviar, precisa de um novo.
      if (captcha) setCaptchaReset((n) => n + 1);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-pine-900">Que bom te ver</h1>
      <p className="mt-1 text-muted">Entre para ver seu saldo.</p>

      {location.state?.registered && (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-md bg-mint-100 p-3 text-sm text-pine-900">
          <Icon name="ok" className="size-5 shrink-0" />
          Conta criada! Entre para continuar.
        </p>
      )}
      {notice === "expired" && !location.state?.registered && (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-md bg-coral-100 p-3 text-sm text-coral-800 [--icon-accent:currentColor]">
          <Icon name="relogio" className="size-5 shrink-0" />
          Sua sessão venceu. Entre de novo para continuar. O que você estava registrando pode não ter sido salvo.
        </p>
      )}
      {apiError && (
        <div className="mt-5">
          <ErrorMessage>{apiError}</ErrorMessage>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <GoogleSection onError={setApiError} />
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="seu@email.com"
            prefix={<Icon name="email" className="size-5" />}
            register={register}
            error={errors.email}
          />
          <PasswordField label="Senha" name="password" autoComplete="current-password" register={register} error={errors.password} />
          {captcha && <Captcha config={captcha} onToken={setCaptchaToken} resetKey={captchaReset} />}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-muted">
        Novo por aqui?{" "}
        <Link to="/signup" className="font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
          Criar conta grátis
        </Link>
      </p>

      <ProtectionDetails />
    </div>
  );
}
