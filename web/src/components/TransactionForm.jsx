import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionFormSchema, categoryOptions, categoryNameSchema } from "@corewallet/shared";
import Icon from "./Icon.jsx";
import Input from "./Input.jsx";
import Select from "./Select.jsx";
import { Button, LinkButton } from "./Button.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import { TYPES } from "../lib/transactionTypes.js";
import { getErrorMessage } from "../lib/api.js";

const NEW = "__nova__";

// Formulário de criar e de editar lançamento. O tipo vem de fora (URL ou lançamento)
// e não muda aqui. A categoria pode ser uma das padrão, uma que a pessoa já criou, ou uma
// nova, criada ali mesmo (onCreateCategory fala com a API e devolve { id, type, name }).
export default function TransactionForm({ type, editing = false, initial, onSubmit, apiError, customCategories = [], onCreateCategory }) {
  const t = TYPES[type];
  const [created, setCreated] = useState([]);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionFormSchema, undefined, { raw: true }),
    defaultValues: initial ?? { value: "", description: "", category: "outros" },
  });

  const all = [...customCategories, ...created.filter((c) => !customCategories.some((x) => x.id === c.id))];
  const options = categoryOptions(type, all);
  // Categoria que o lançamento já tem mas a lista (ainda) não conhece: mantém o valor no campo.
  const current = initial?.category;
  if (current && !options.some((o) => o.id === current)) options.push({ id: current, label: "Categoria que você criou", custom: true });
  const selected = useWatch({ control, name: "category" });
  const makingNew = selected === NEW;

  // Última categoria "de verdade" escolhida: cancelar a criação volta para ela, e não para "Outros".
  const lastReal = useRef(initial?.category ?? "outros");
  const wasMaking = useRef(false);
  useEffect(() => {
    if (selected !== NEW) lastReal.current = selected;
    // Ao sair do grupo "Nova categoria" (criou ou cancelou) o foco estava dentro dele, que sumiu:
    // devolve o foco para o campo Categoria.
    if (wasMaking.current && !makingNew) document.getElementById("category")?.focus();
    wasMaking.current = makingNew;
  }, [selected, makingNew]);

  async function createCategory() {
    setCreateError("");
    const parsed = categoryNameSchema.safeParse(newName);
    if (!parsed.success) return setCreateError(parsed.error.issues[0].message);
    setCreating(true);
    try {
      const category = await onCreateCategory({ type, name: parsed.data });
      // A opção nova precisa estar na tela antes de ser selecionada.
      if (category.id.length === 24) flushSync(() => setCreated((list) => [...list, category]));
      setValue("category", category.id, { shouldValidate: true });
      setNewName("");
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function cancelNew() {
    setNewName("");
    setCreateError("");
    setValue("category", lastReal.current);
  }

  function submit(event) {
    if (getValues("category") === NEW) {
      event.preventDefault();
      setError("category", { message: "Crie a categoria ou escolha outra" });
      return;
    }
    return handleSubmit(onSubmit)(event);
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link to="/" className="mb-4 inline-flex items-center gap-2 rounded-md py-1 text-sm font-medium text-pine-900 hover:text-pine-700">
        <Icon name="voltar" className="size-5" />
        Voltar
      </Link>

      <div className="rounded-lg border border-line bg-white p-6 sm:p-8">
        <header className="flex items-center gap-4">
          <span className={`grid size-14 place-items-center rounded-lg ${t.badge}`}>
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

        <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
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
          <Select
            label="Categoria"
            name="category"
            options={[...options, { id: NEW, label: "+ Nova categoria…" }]}
            register={register}
            error={errors.category}
          />

          {makingNew && (
            <div role="group" aria-label="Nova categoria" className="flex flex-col gap-3 rounded-lg bg-mint-50 p-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-category-name" className="text-sm font-medium text-ink">
                  Nome da nova categoria
                </label>
                <input
                  id="new-category-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter cria a categoria, não envia o lançamento.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createCategory();
                    }
                  }}
                  maxLength={30}
                  autoComplete="off"
                  placeholder="Ex.: Pets"
                  aria-invalid={createError ? "true" : undefined}
                  aria-describedby="new-category-help"
                  className="h-12 w-full rounded-md border border-line bg-white px-3.5 text-base text-ink placeholder:text-muted hover:border-pine-700/60 focus:border-pine-700 focus:outline-2 focus:outline-offset-0 focus:outline-pine-700/30"
                />
                <p id="new-category-help" className="text-sm text-muted">
                  De 2 a 30 caracteres. Ela fica disponível nos próximos lançamentos.
                </p>
              </div>
              {createError && <ErrorMessage>{createError}</ErrorMessage>}
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="ghost" onClick={cancelNew}>
                  Cancelar
                </Button>
                <Button type="button" variant="pine" onClick={createCategory} disabled={creating}>
                  {creating ? "Criando…" : "Criar categoria"}
                </Button>
              </div>
            </div>
          )}

          {editing && <p className="text-sm text-muted">A data do lançamento e o tipo (receita ou despesa) não mudam. Para trocar o tipo, exclua e crie de novo. Cada edição fica registrada no histórico.</p>}
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <LinkButton to="/" variant="ghost">
              Cancelar
            </LinkButton>
            <Button type="submit" variant={t.button} disabled={isSubmitting || makingNew}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
