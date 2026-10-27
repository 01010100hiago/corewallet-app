import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import Input from "../components/Input.jsx";
import { Button } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";

// Primeiro acesso com o Google: o Google já entregou nome e email verificado.
// Falta confirmar como a pessoa quer ser chamada. É só isso que pedimos.
export default function Welcome() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  usePageTitle("Complete seu perfil");
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema, undefined, { raw: true }),
    defaultValues: { name: user?.name ?? "" },
  });

  async function onSubmit(data) {
    setApiError("");
    try {
      await updateProfile(data);
      navigate("/", { replace: true });
    } catch (error) {
      setApiError(getErrorMessage(error));
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate("/signin", { replace: true });
    } catch {
      setApiError("Não foi possível sair agora. Tente de novo.");
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-pine-900">Complete seu perfil</h1>
      <p className="mt-1 text-muted">{user?.provider === "google" ? "O Google já confirmou seu email. Falta só o nome." : "Falta só confirmar o nome."}</p>

      <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-white p-4">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-mint-100 text-pine-900">
          <Icon name="email" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user?.email}</p>
          {user?.provider === "google" && (
            <p className="flex items-center gap-1.5 text-sm text-pine-900">
              <Icon name="ok" className="size-4" />
              Verificado pelo Google
            </p>
          )}
        </div>
      </div>

      {apiError && (
        <div className="mt-5">
          <ErrorMessage>{apiError}</ErrorMessage>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 flex flex-col gap-4">
        <Input
          label="Como podemos te chamar?"
          name="name"
          autoComplete="name"
          prefix={<Icon name="pessoa" className="size-5" />}
          hint={user?.provider === "google" ? "Vem do seu Google. Pode mudar." : undefined}
          maxLength={80}
          register={register}
          error={errors.name}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : "Continuar"}
        </Button>
      </form>

      <p className="mt-5 text-sm text-muted">
        Para você pedimos só o nome. Guardamos também o seu email e o identificador da sua conta Google. Sem senha, sem telefone, sem documentos.
      </p>
      <p className="mt-4 text-center text-sm text-muted">
        Não é você?{" "}
        <button type="button" onClick={handleLogout} className="font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
          Sair
        </button>
      </p>
    </div>
  );
}
