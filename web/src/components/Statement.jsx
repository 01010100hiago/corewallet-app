import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { categoryLabel, categoryOptions } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import { inBrasilia } from "../lib/brasilia.js";
import { useCategories } from "../lib/useCategories.js";
import Icon from "./Icon.jsx";
import Money from "./Money.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import TransactionHistory from "./TransactionHistory.jsx";

const PAGE_SIZE = 30;
const EMPTY = { q: "", type: "", category: "", status: "all", from: "", to: "" };
const SITUATIONS = ["active", "archived", "deleted"];
const STATUS_LABEL = { active: "Na lista", archived: "Arquivado", deleted: "Excluído" };
const STATUS_BADGE = { active: "bg-mint-100 text-pine-900", archived: "bg-canvas text-ink", deleted: "bg-coral-100 text-coral-800" };

const field = "h-11 w-full rounded-md border border-line bg-white px-3 text-base text-ink transition hover:border-pine-700/60 focus:border-pine-700 focus:outline-2 focus:outline-offset-0 focus:outline-pine-700/30";
const action =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-pine-900 transition hover:bg-mint-100 disabled:opacity-60 [--icon-accent:currentColor]";

// Só o que foi preenchido vai para a API.
function toParams(f, cursor) {
  const p = { status: f.status, limit: PAGE_SIZE };
  for (const key of ["q", "type", "category", "from", "to"]) if (f[key].trim()) p[key] = f[key].trim();
  if (cursor) p.cursor = cursor;
  return p;
}

// Categorias para o filtro: as do tipo escolhido ou, sem tipo, as de despesa e de receita sem repetir.
function filterOptions(type, custom) {
  const lists = type ? [categoryOptions(type, custom)] : [categoryOptions("output", custom), categoryOptions("input", custom)];
  const seen = new Set();
  return lists.flat().filter((o) => !seen.has(o.id) && seen.add(o.id));
}

// Aba "Extrato": todos os lançamentos, com busca e filtros. Os totais valem para o filtro inteiro
// (não só para a página carregada). O horário mostrado é o que o servidor registrou.
export default function Statement() {
  const { expire } = useAuth();
  const custom = useCategories().list;
  // Links de fora podem abrir o extrato já filtrado (?situacao=archived).
  const [params] = useSearchParams();
  const initial = SITUATIONS.includes(params.get("situacao")) ? { ...EMPTY, status: params.get("situacao") } : EMPTY;
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial); // `filters` com a busca já esperando a pessoa parar de digitar
  const [page, setPage] = useState(null); // { transactions, totals, nextCursor } | null enquanto carrega
  const [loadError, setLoadError] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [open, setOpen] = useState(() => new Set()); // lançamentos com o histórico aberto
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const generation = useRef(0); // descarta respostas de buscas que já foram trocadas por outra

  useEffect(() => {
    const t = setTimeout(() => setApplied(filters), filters.q === applied.q ? 0 : 350);
    return () => clearTimeout(t);
  }, [filters, applied.q]);

  // A lista na tela é a de qual busca? Enquanto a resposta da busca atual não chega, ela está velha.
  const requestKey = JSON.stringify([applied, reload]);
  useEffect(() => {
    const mine = ++generation.current;
    api
      .get("/transactions/search", { params: toParams(applied) })
      .then((res) => {
        if (mine !== generation.current) return;
        setPage({ ...res.data, key: requestKey });
        setLoadError("");
        setMoreError("");
      })
      .catch((err) => {
        if (mine !== generation.current) return;
        if (err.response?.status === 401) return expire();
        setPage(null);
        setLoadError(getErrorMessage(err));
      });
  }, [applied, reload, expire, requestKey]);

  const set = (key) => (e) =>
    setFilters((f) => {
      const next = { ...f, [key]: e.target.value };
      // Trocar o tipo pode deixar a categoria escolhida sem sentido (ex.: de despesa para receita).
      if (key === "type" && next.category && !filterOptions(next.type, custom).some((o) => o.id === next.category)) next.category = "";
      return next;
    });
  const clear = () => {
    setFilters(EMPTY);
    setApplied(EMPTY);
    searchRef.current?.focus(); // o botão fica desligado ao limpar: o foco vai para a busca
  };
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY);

  async function loadMore() {
    const mine = generation.current;
    setMoreBusy(true);
    setMoreError("");
    try {
      const res = await api.get("/transactions/search", { params: toParams(applied, page.nextCursor) });
      if (mine !== generation.current) return;
      setPage((p) => ({ ...res.data, key: p.key, transactions: [...p.transactions, ...res.data.transactions] }));
    } catch (err) {
      if (err.response?.status === 401) return expire();
      if (mine === generation.current) setMoreError(getErrorMessage(err));
    } finally {
      setMoreBusy(false);
    }
  }

  const act = useCallback(
    async (t, { path, done }) => {
      setActionError("");
      setNotice("");
      setBusyId(t.id);
      try {
        await api.post(`/transactions/${t.id}/${path}`);
        setNotice(`“${t.description}” ${done}`);
        setReload((n) => n + 1);
        listRef.current?.focus(); // a linha some da lista: o foco fica no extrato, não se perde
      } catch (err) {
        if (err.response?.status === 401) return expire();
        if (err.response?.status === 404) setReload((n) => n + 1); // a lista só estava velha
        else setActionError(getErrorMessage(err));
      } finally {
        setBusyId("");
      }
    },
    [expire]
  );

  const toggle = (id) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const pending = Boolean(page) && page.key !== requestKey;
  const rows = page?.transactions ?? [];
  const totals = page?.totals;
  const options = filterOptions(filters.type, custom);

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Filtros" className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-white p-4 shadow-sm sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
          <label htmlFor="f-q" className="text-sm font-medium text-ink">
            Buscar pela descrição
          </label>
          <input ref={searchRef} id="f-q" type="search" value={filters.q} onChange={set("q")} maxLength={100} placeholder="Ex.: mercado, aluguel…" className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-type" className="text-sm font-medium text-ink">
            Tipo
          </label>
          <select id="f-type" value={filters.type} onChange={set("type")} className={field}>
            <option value="">Todos</option>
            <option value="output">Despesas</option>
            <option value="input">Receitas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-category" className="text-sm font-medium text-ink">
            Categoria
          </label>
          <select id="f-category" value={filters.category} onChange={set("category")} className={field}>
            <option value="">Todas</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor="f-status" className="text-sm font-medium text-ink">
            Situação
          </label>
          <select id="f-status" value={filters.status} onChange={set("status")} className={field}>
            <option value="all">Todos (menos excluídos)</option>
            <option value="active">Na lista</option>
            <option value="archived">Arquivados</option>
            <option value="deleted">Excluídos</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-from" className="text-sm font-medium text-ink">
            De
          </label>
          <input id="f-from" type="date" value={filters.from} min="2000-01-01" max={filters.to || "2100-12-31"} onChange={set("from")} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-to" className="text-sm font-medium text-ink">
            Até
          </label>
          <input id="f-to" type="date" value={filters.to} max="2100-12-31" min={filters.from || "2000-01-01"} onChange={set("to")} className={field} />
        </div>
        <div className="col-span-2 flex items-end">
          <button type="button" onClick={clear} disabled={!filtered} className={`${action} h-11 w-full justify-center border border-line sm:w-auto`}>
            Limpar filtros
          </button>
        </div>
      </section>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-mint-100 p-3.5 text-sm text-pine-900">
          <Icon name="ok" className="size-5 shrink-0" />
          {notice}
        </p>
      )}
      {actionError && <ErrorMessage>{actionError}</ErrorMessage>}
      {loadError && (
        <div className="flex flex-col items-start gap-2">
          <ErrorMessage>{loadError}</ErrorMessage>
          <button type="button" onClick={() => setReload((n) => n + 1)} className={`${action} border border-line`}>
            Tentar de novo
          </button>
        </div>
      )}

      <section ref={listRef} tabIndex={-1} aria-label="Extrato" aria-busy={pending} className={`overflow-hidden rounded-lg border border-line bg-white shadow-sm transition-opacity focus:outline-none ${pending ? "pointer-events-none opacity-60" : ""}`}>
        {!page && !loadError ? (
          <p role="status" className="px-5 py-8 text-center text-muted">
            Carregando extrato…
          </p>
        ) : page && (
          <>
            <p className="tabular flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-5 py-3 text-sm" aria-label="Totais do filtro">
              <span className="font-medium text-ink">{totals.count === 1 ? "1 lançamento" : `${totals.count} lançamentos`}</span>
              <span className="text-muted">
                Receitas <span className="font-semibold text-positive"><Money cents={totals.totalIn} /></span>
              </span>
              <span className="text-muted">
                Despesas <span className="font-semibold text-negative"><Money cents={totals.totalOut} /></span>
              </span>
            </p>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
                <span className="grid size-16 place-items-center rounded-md bg-mint-100 text-pine-900">
                  <Icon name="relogio" className="size-9" />
                </span>
                <p className="font-medium">{filtered ? "Nenhum lançamento com esses filtros" : "Nenhum lançamento ainda"}</p>
                <p className="max-w-xs text-sm text-muted">{filtered ? "Tente buscar outra palavra ou ampliar o período." : "Quando você registrar uma receita ou despesa, ela aparece aqui."}</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((t) => {
                  const input = t.type === "input";
                  const when = inBrasilia(t.createdAt);
                  return (
                    <li key={t.id} className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-md ${input ? "bg-mint-100 text-pine-900" : "bg-coral-100 text-coral-800"}`}>
                          <Icon name={input ? "entrada" : "saida"} className="size-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium [overflow-wrap:anywhere]">{t.description}</span>
                          <span className="text-sm text-muted">
                            {categoryLabel(t.type, t.category, custom)} ·{" "}
                            <time dateTime={t.createdAt} title={`Registrado em ${when.format("DD/MM/YYYY [às] HH:mm:ss")} (horário de Brasília)`}>
                              {when.format("DD/MM/YYYY [às] HH:mm")}
                            </time>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`tabular font-semibold ${input ? "text-positive" : "text-negative"}`}>
                            {!input && "− "}
                            <Money cents={t.value} />
                          </span>
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 sm:ml-[3.25rem]">
                        {t.status === "active" && (
                          <Link to={`/transaction/${t.id}/edit`} className={action} aria-label={`Editar ${t.description}`}>
                            <Icon name="editar" className="size-5" />
                            Editar
                          </Link>
                        )}
                        {t.status === "archived" && (
                          <button type="button" disabled={busyId !== ""} onClick={() => act(t, { path: "unarchive", done: "voltou para a lista." })} className={action} aria-label={`Desarquivar ${t.description}`}>
                            <Icon name="arquivar" className="size-5" />
                            {busyId === t.id ? "Desarquivando…" : "Desarquivar"}
                          </button>
                        )}
                        {t.status === "deleted" && (
                          <button type="button" disabled={busyId !== ""} onClick={() => act(t, { path: "restore", done: "voltou para a lista e para o saldo." })} className={action} aria-label={`Restaurar ${t.description}`}>
                            <Icon name="renovar" className="size-5" />
                            {busyId === t.id ? "Restaurando…" : "Restaurar"}
                          </button>
                        )}
                        <button type="button" onClick={() => toggle(t.id)} aria-expanded={open.has(t.id)} aria-controls={`extrato-${t.id}`} aria-label={`Alterações de ${t.description}`} className={action}>
                          <Icon name="relogio" className="size-5" />
                          Alterações
                        </button>
                      </div>
                      {open.has(t.id) && (
                        <div id={`extrato-${t.id}`} className="mt-3 sm:ml-[3.25rem]">
                          <TransactionHistory transactionId={t.id} categories={custom} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {page.nextCursor && (
              <div className="flex flex-col items-center gap-2 border-t border-line px-5 py-4">
                {moreError && <ErrorMessage>{moreError}</ErrorMessage>}
                <button type="button" onClick={loadMore} disabled={moreBusy} className={`${action} h-11 border border-line px-5`}>
                  {moreBusy ? "Carregando…" : "Carregar mais"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
