import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionFormSchema, CATEGORIES } from "@corewallet/shared";
import Icon from "./Icon.jsx";
import Input from "./Input.jsx";
import Select from "./Select.jsx";
import { Button, LinkButton } from "./Button.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import { TYPES } from "../lib/transactionTypes.js";

// Formulário de criar e de editar lançamento. O tipo vem de fora (URL ou lançamento)
// e não muda aqui; categoria só oferece as do tipo.
export default function TransactionForm({ type, editing = false, initial, onSubmit, apiError }) {
  const t = TYPES[type];
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionFormSchema, undefined, { raw: true }),
    defaultValues: initial ?? { value: "", description: "", category: "outros" },
  });

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
            <h1 className="text-2xl font-semibold text-pine-900">{editing ? t.editTitle : t.title}</h1>
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
          <Select label="Categoria" name="category" options={CATEGORIES[type]} register={register} error={errors.category} />
          {editing && <p className="text-sm text-muted">A data do lançamento e o tipo (entrada ou saída) não mudam. Para trocar o tipo, exclua e crie de novo.</p>}
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
