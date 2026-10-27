import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionSchema, TRANSACTION_TYPES } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import Input from "../components/Input.jsx";
import { Button, LinkButton } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";

// O tipo vem da URL; no formulário só valem valor e descrição.
const formSchema = transactionSchema.omit({ type: true });

const TYPES = {
  input: { title: "Nova entrada", hint: "Dinheiro que entrou", icon: "entrada", badge: "bg-mint-100 text-pine-900", button: "pine" },
  output: { title: "Nova saída", hint: "Dinheiro que saiu", icon: "saida", badge: "bg-coral-100 text-coral-800", button: "primary" },
};

export default function NewTransaction() {
  const { type } = useParams();
  if (!TRANSACTION_TYPES.includes(type)) return <Navigate to="/" replace />;
  return <TransactionForm type={type} />;
}

function TransactionForm({ type }) {
  const navigate = useNavigate();
  const { expire } = useAuth();
  const [apiError, setApiError] = useState("");
  const t = TYPES[type];
  usePageTitle(t.title);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(formSchema, undefined, { raw: true }),
    defaultValues: { value: "", description: "" },
  });

  async function onSubmit(data) {
    setApiError("");
    try {
      // O valor segue como o usuário digitou ("12,50"); a API converte em centavos.
      await api.post("/transactions", { ...data, type });
      navigate("/", { state: { saved: true } });
    } catch (error) {
      if (error.response?.status === 401) return expire();
      // Sem resposta (rede caiu ou demorou demais) o servidor pode ter gravado mesmo assim.
      setApiError(
        error.response
          ? getErrorMessage(error)
          : "Não conseguimos confirmar se o lançamento foi salvo. Confira na página inicial antes de tentar de novo."
      );
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link to="/" className="mb-4 inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-pine-900 hover:text-pine-700">
        <Icon name="voltar" className="size-5" />
        Voltar
      </Link>

      <div className="rounded-3xl border border-line bg-white p-6 sm:p-8">
        <header className="flex items-center gap-4">
          <span className={`grid size-14 place-items-center rounded-2xl ${t.badge}`}>
            <Icon name={t.icon} className="size-8" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-pine-900">{t.title}</h1>
            <p className="text-muted">{t.hint}</p>
          </div>
        </header>

        {apiError && (
          <div className="mt-5">
            <ErrorMessage>{apiError}</ErrorMessage>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 flex flex-col gap-4">
          <Input
            label="Valor (R$)"
            name="value"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            hint="Pode usar vírgula, como em 12,50."
            prefix={<span className="text-base font-medium">R$</span>}
            register={register}
            error={errors.value}
          />
          <Input label="Descrição" name="description" autoComplete="off" maxLength={100} placeholder="Ex.: Mercado" register={register} error={errors.description} />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <LinkButton to="/" variant="ghost">
              Cancelar
            </LinkButton>
            <Button type="submit" variant={t.button} disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
