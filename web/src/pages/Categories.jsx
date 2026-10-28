import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, MAX_CUSTOM_CATEGORIES_PER_TYPE, categoryNameSchema, categoryOptions } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import PageHeader from "../components/PageHeader.jsx";
import Icon from "../components/Icon.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { Button } from "../components/Button.jsx";

const GROUPS = [
  { type: "output", title: "Despesas", empty: "Você ainda não criou categorias de despesa." },
  { type: "input", title: "Receitas", empty: "Você ainda não criou categorias de receita." },
];

const field =
  "h-10 w-full rounded-md border border-line bg-white px-3 text-base text-ink placeholder:text-muted hover:border-pine-700/60 focus:border-pine-700 focus:outline-2 focus:outline-offset-0 focus:outline-pine-700/30";
const small =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-pine-900 transition hover:bg-mint-100 disabled:opacity-60 [--icon-accent:currentColor]";

// Cadastro de categorias: as padrão (fixas) e as que a pessoa cria, para receitas e despesas.
// Dá para criar, renomear e apagar as suas; apagar uma que tem lançamentos pede o destino deles.
export default function Categories() {
  const { expire } = useAuth();
  usePageTitle("Categorias");
  const [state, setState] = useState({ status: "loading" }); // { custom, usage } | { error }
  const [notice, setNotice] = useState("");
  const noticeRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [custom, usage] = await Promise.all([api.get("/categories"), api.get("/categories/usage")]);
      setState({ status: "ready", custom: custom.data.categories, usage: usage.data.usage });
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setState({ status: "error", error: getErrorMessage(err) });
    }
  }, [expire]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get("/categories"), api.get("/categories/usage")])
      .then(([custom, usage]) => !cancelled && setState({ status: "ready", custom: custom.data.categories, usage: usage.data.usage }))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) expire();
        else setState({ status: "error", error: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [expire]);

  // Renomear e apagar fecham o próprio painel (o foco iria para o fim da página): o foco vai para o aviso.
  const changed = async (message, { moveFocus = false } = {}) => {
    setNotice(message);
    await load();
    if (moveFocus) requestAnimationFrame(() => noticeRef.current?.focus());
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Categorias" subtitle="Organize do seu jeito" />

      {notice && (
        <p ref={noticeRef} tabIndex={-1} role="status" className="flex items-center gap-2 rounded-md bg-mint-100 p-3.5 text-sm text-pine-900 focus:outline-none">
          <Icon name="ok" className="size-5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="rounded-md px-2 py-1 font-medium underline underline-offset-4 hover:bg-white/60">
            Fechar
          </button>
        </p>
      )}

      {state.status === "loading" && (
        <p role="status" className="py-10 text-center text-muted">
          Carregando categorias…
        </p>
      )}
      {state.status === "error" && (
        <div className="flex flex-col gap-3">
          <ErrorMessage>{state.error}</ErrorMessage>
          <Button variant="soft" icon="renovar" onClick={() => { setState({ status: "loading" }); load(); }}>
            Tentar de novo
          </Button>
        </div>
      )}

      {state.status === "ready" &&
        GROUPS.map((g) => <Group key={g.type} {...g} custom={state.custom.filter((c) => c.type === g.type)} allCustom={state.custom} usage={state.usage} onChanged={changed} expire={expire} />)}

      <p className="text-sm text-muted">As categorias padrão não podem ser renomeadas nem apagadas. As suas, sim: os lançamentos acompanham o novo nome.</p>
    </div>
  );
}

function Group({ type, title, empty, custom, allCustom, usage, onChanged, expire }) {
  const count = (category) => usage.find((u) => u.type === type && u.category === category)?.count ?? 0;
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // id
  const [deleting, setDeleting] = useState(null); // id
  const full = custom.length >= MAX_CUSTOM_CATEGORIES_PER_TYPE;

  async function add(event) {
    event.preventDefault();
    setAddError("");
    const parsed = categoryNameSchema.safeParse(newName);
    if (!parsed.success) return setAddError(parsed.error.issues[0].message);
    setBusy(true);
    try {
      const res = await api.post("/categories", { type, name: parsed.data });
      setNewName("");
      await onChanged(res.status === 201 ? `Categoria “${res.data.name}” criada.` : `A categoria “${res.data.name}” já existia.`);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setAddError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Categorias de ${title.toLowerCase()}`} className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-pine-900">{title}</h2>
        <span className="text-sm text-muted">
          {custom.length} de {MAX_CUSTOM_CATEGORIES_PER_TYPE} categorias suas
        </span>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {CATEGORIES[type].map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{c.label}</span>
            <span className="rounded-md bg-canvas px-2 py-0.5 text-xs font-medium text-muted">Padrão</span>
            <Uses n={count(c.id)} />
          </li>
        ))}
        {custom.map((c) => (
          <li key={c.id} className="py-2.5">
            {editing === c.id ? (
              <Rename category={c} onCancel={() => { setEditing(null); backTo(`rename-btn-${c.id}`); }} onDone={async (name) => { setEditing(null); await onChanged(`Categoria renomeada para “${name}”.`, { moveFocus: true }); }} expire={expire} />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{c.name}</span>
                <Uses n={count(c.id)} />
                <span className="flex gap-1">
                  <button id={`rename-btn-${c.id}`} type="button" className={small} onClick={() => { setDeleting(null); setEditing(c.id); }} aria-label={`Renomear ${c.name}`}>
                    <Icon name="editar" className="size-5" />
                    Renomear
                  </button>
                  <button id={`delete-btn-${c.id}`} type="button" className={small} onClick={() => { setEditing(null); setDeleting(c.id); }} aria-label={`Apagar ${c.name}`}>
                    <Icon name="lixeira" className="size-5" />
                    Apagar
                  </button>
                </span>
              </div>
            )}
            {deleting === c.id && (
              <Delete category={c} uses={count(c.id)} options={categoryOptions(type, allCustom).filter((o) => o.id !== c.id)} onCancel={() => { setDeleting(null); backTo(`delete-btn-${c.id}`); }} onDone={async (message) => { setDeleting(null); await onChanged(message, { moveFocus: true }); }} expire={expire} />
            )}
          </li>
        ))}
      </ul>
      {custom.length === 0 && <p className="mt-1 text-sm text-muted">{empty}</p>}

      <form onSubmit={add} noValidate className="mt-4 border-t border-line pt-4">
        <label htmlFor={`new-${type}`} className="text-sm font-medium text-ink">
          Nova categoria de {title.toLowerCase().slice(0, -1)}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={`new-${type}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={30}
            autoComplete="off"
            placeholder={type === "output" ? "Ex.: Pets" : "Ex.: Aluguel recebido"}
            aria-invalid={addError ? "true" : undefined}
            aria-describedby={addError ? `new-${type}-error` : undefined}
            disabled={full}
            className={`${field} disabled:bg-canvas`}
          />
          <Button type="submit" variant="pine" icon="mais" disabled={busy || full} inline>
            Adicionar
          </Button>
        </div>
        {full && <p className="mt-1.5 text-sm text-muted">Você chegou ao limite de {MAX_CUSTOM_CATEGORIES_PER_TYPE} categorias. Apague uma para criar outra.</p>}
        {addError && (
          <p id={`new-${type}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-negative [--icon-accent:currentColor]">
            <Icon name="aviso" className="size-4 shrink-0" />
            {addError}
          </p>
        )}
      </form>
    </section>
  );
}

// Devolve o foco ao botão que abriu o painel (que acabou de fechar).
const backTo = (id) => requestAnimationFrame(() => document.getElementById(id)?.focus());

const Uses = ({ n }) => <span className="w-28 shrink-0 text-right text-sm text-muted">{n === 0 ? "sem lançamentos" : n === 1 ? "1 lançamento" : `${n} lançamentos`}</span>;

function Rename({ category, onCancel, onDone, expire }) {
  const [name, setName] = useState(category.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setError("");
    const parsed = categoryNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (parsed.data === category.name) return onCancel();
    setBusy(true);
    try {
      await api.patch(`/categories/${category.id}`, { name: parsed.data });
      await onDone(parsed.data);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate role="group" aria-label={`Renomear ${category.name}`}>
      <label htmlFor={`rename-${category.id}`} className="sr-only">
        Novo nome de {category.name}
      </label>
      <div className="flex gap-2">
        <input
          id={`rename-${category.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          autoComplete="off"
          autoFocus
          aria-invalid={error ? "true" : undefined}
          className={field}
        />
        <Button type="submit" variant="pine" disabled={busy} inline>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} inline>
          Cancelar
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-negative [--icon-accent:currentColor]">
          <Icon name="aviso" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </form>
  );
}

function Delete({ category, uses, options, onCancel, onDone, expire }) {
  const boxRef = useRef(null);
  useEffect(() => boxRef.current?.focus(), []); // o painel abre com o foco nele
  const [moveTo, setMoveTo] = useState("outros");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      const res = await api.delete(`/categories/${category.id}`, { params: uses > 0 ? { moveTo } : {} });
      const where = options.find((o) => o.id === moveTo)?.label;
      await onDone(res.data.moved > 0 ? `Categoria “${category.name}” apagada. ${res.data.moved} ${res.data.moved === 1 ? "lançamento foi movido" : "lançamentos foram movidos"} para “${where}”.` : `Categoria “${category.name}” apagada.`);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div role="group" ref={boxRef} tabIndex={-1} aria-label={`Apagar ${category.name}`} className="mt-3 focus:outline-none flex flex-col gap-3 rounded-md bg-coral-100/60 p-3">
      {uses > 0 ? (
        <>
          <p className="text-sm text-coral-950">
            “{category.name}” tem {uses} {uses === 1 ? "lançamento" : "lançamentos"}. Para onde movê-{uses === 1 ? "lo" : "los"}? Cada mudança fica no histórico.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`move-${category.id}`} className="text-sm font-medium text-coral-950">
              Mover para
            </label>
            <select id={`move-${category.id}`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={field}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p className="text-sm text-coral-950">Apagar “{category.name}”? Nenhum lançamento usa esta categoria.</p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={small}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-negative px-3 text-sm font-semibold text-white transition hover:bg-coral-800 disabled:opacity-60"
        >
          {busy ? "Apagando…" : uses > 0 ? "Mover e apagar" : "Apagar"}
        </button>
      </div>
    </div>
  );
}
