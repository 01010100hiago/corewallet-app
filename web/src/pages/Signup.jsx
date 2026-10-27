import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupFormSchema } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { useConfig } from "../context/configContext.js";
import { getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import Input from "../components/Input.jsx";
import PasswordField from "../components/PasswordField.jsx";
import PasswordStrength, { PASSWORD_RULES_ID } from "../components/PasswordStrength.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";
import { Button } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import ProtectionDetails from "../components/ProtectionDetails.jsx";
import GoogleSection from "../components/GoogleSection.jsx";
import Captcha from "../components/Captcha.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const { captcha } = useConfig();
  usePageTitle("Criar conta");
  const navigate = useNavigate();
  const [apiError, setApiError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupFormSchema, undefined, { raw: true }),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const password = useWatch({ control, name: "password" });

  async function onSubmit({ name, email, password: pass }) {
    setApiError("");
    if (captcha && !captchaToken) {
      setApiError(captcha.provider === "pow" ? "Aguarde a verificação de segurança terminar (leva poucos segundos) e tente de novo." : "Confirme que você não é um robô.");
      return;
    }
    try {
      await signup(captcha ? { name, email, password: pass, captchaToken } : { name, email, password: pass });
      navigate("/signin", { state: { registered: true } });
    } catch (error) {
      setApiError(getErrorMessage(error));
      // O token do captcha vale uma vez só: depois de enviar, precisa de um novo.
      if (captcha) setCaptchaReset((n) => n + 1);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-pine-900">Criar sua conta</h1>
      <p className="mt-1 text-muted">Leva menos de um minuto.</p>

      {apiError && (
        <div className="mt-5">
          <ErrorMessage>{apiError}</ErrorMessage>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
      <GoogleSection onError={setApiError} />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input label="Nome completo" name="name" autoComplete="name" prefix={<Icon name="pessoa" className="size-5" />} register={register} error={errors.name} />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          prefix={<Icon name="email" className="size-5" />}
          register={register}
          error={errors.email}
        />
        <PasswordField label="Senha" name="password" autoComplete="new-password" describedBy={PASSWORD_RULES_ID} register={register} error={errors.password} />
        <PasswordStrength password={password ?? ""} />
        <PasswordField label="Confirme a senha" noun="confirmação" name="confirmPassword" autoComplete="new-password" register={register} error={errors.confirmPassword} />
        {captcha && <Captcha config={captcha} onToken={setCaptchaToken} resetKey={captchaReset} />}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Criando…" : "Criar conta"}
        </Button>
      </form>
      </div>

      <p className="mt-6 text-center text-muted">
        Já tem conta?{" "}
        <Link to="/signin" className="font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
          Entrar
        </Link>
      </p>

      <ProtectionDetails />
    </div>
  );
}
