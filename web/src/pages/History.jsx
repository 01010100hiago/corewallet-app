import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import { inBrasilia } from "../lib/brasilia.js";
import { categoryLabel } from "@corewallet/shared";
import Money from "../components/Money.jsx";
import { usePrivacy } from "../context/privacyContext.js";
import { ACTION_LABEL, describeChange, describeSnapshot } from "../lib/historyText.js";
import { useCategories } from "../lib/useCategories.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import Icon from "../components/Icon.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";

const BADGE = {
  created: "bg-mint-100 text-pine-900",
  edited: "bg-canvas text-ink",
  deleted: "bg-coral-100 text-coral-800",
  restored: "bg-mint-100 text-pine-900",
  archived: "bg-canvas text-ink",
  unarchived: "bg-mint-100 text-pine-900",
};

// Registro de tudo que foi criado, editado, excluído ou restaurado. Excluir tira o lançamento
// da lista e do saldo, mas ele continua aqui, e dá para restaurar.
export default function History() {
  const { expire } = useAuth();
  const { hidden } = usePrivacy();
  const custom = useCategories().list;
  usePageTitle("Histórico de alterações");
  const [result, setResult] = useState(null); // { events, deleted, archived, truncated } | { error }
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/transactions/activity")
      .then((res) => !cancelled && setResult({
            events: res.data.events,
            deleted: res.data.deleted ?? [],
            archived: res.data.archived ?? [],
            truncated: Boolean(res.data.truncated),
            deletedTruncated: Boolean(res.data.deletedTruncated),
            archivedTruncated: Boolean(res.data.archivedTruncated),
          }))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) expire();
        else setResult({ error: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [reload, expire]);

  // Restaurar (excluído) e desarquivar (arquivado) seguem o mesmo caminho: chama a API, avisa e recarrega.
  const act = useCallback(
    async (transaction, { path, done }) => {
      setError("");
      setNotice("");
      setBusy(transaction.id);
      try {
        await api.post(`/transactions/${transaction.id}/${path}`);
        setNotice(`“${transaction.description}” ${done}`);
        setReload((n) => n + 1);
      } catch (err) {
        if (err.response?.status === 401) return expire();
        // 404: já foi tratado em outro lugar (outra aba); a lista só estava velha.
        if (err.response?.status === 404) setReload((n) => n + 1);
        else setError(getErrorMessage(err));
      } finally {
        setBusy("");
      }
    },
    [expire]
  );
  const restore = (t) => act(t, { path: "restore", done: "voltou para a lista e para o saldo." });
  const unarchive = (t) => act(t, { path: "unarchive", done: "voltou para a lista." });

  const events = result?.events;
  const deleted = result?.deleted ?? [];
  const archived = result?.archived ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Link to="/" className="inline-flex w-fit items-center gap-2 rounded-md py-1 text-sm font-medium text-pine-900 hover:text-pine-700">
        <Icon name="voltar" className="size-5" />
        Voltar
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-pine-900">Histórico de alterações</h1>
        <p className="mt-1 text-muted">
          Aqui ficam as suas alterações mais recentes: o que você criou, editou, arquivou, excluiu ou restaurou. O que é arquivado sai da lista, mas continua no saldo. O que é excluído sai do saldo, mas aparece em “Excluídos” e pode ser restaurado.
        </p>
      </header>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-mint-100 p-3.5 text-sm text-pine-900">
          <Icon name="ok" className="size-5 shrink-0" />
          {notice}
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result?.error && <ErrorMessage>{result.error}</ErrorMessage>}

      {archived.length > 0 && (
        <section aria-label="Arquivados" className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-pine-900">Arquivados</h2>
            <p className="text-sm text-muted">Fora da lista, mas ainda contam no saldo, nos totais e no gráfico. Desarquive para voltar à lista.</p>
          </div>
          <ul className="divide-y divide-line">
            {archived.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium [overflow-wrap:anywhere]">{t.description}</p>
                  <p className="text-sm text-muted">
                    {t.type === "input" ? "Receita" : "Despesa"} · <Money cents={t.value} /> · {categoryLabel(t.type, t.category, custom)} · arquivado em{" "}
                    {inBrasilia(t.archivedAt).format("DD/MM/YYYY [às] HH:mm")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unarchive(t)}
                  disabled={busy !== ""}
                  aria-label={`Desarquivar ${t.description}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-mint-100 px-3.5 text-sm font-semibold text-pine-900 transition hover:bg-mint-300/60 disabled:opacity-60 [--icon-accent:currentColor]"
                >
                  <Icon name="arquivar" className="size-5" />
                  {busy === t.id ? "Desarquivando…" : "Desarquivar"}
                </button>
              </li>
            ))}
          </ul>
          {result?.archivedTruncated && <p className="border-t border-line px-5 py-3 text-sm text-muted">Mostrando os 200 arquivados mais recentes. Ao desarquivar, os mais antigos aparecem aqui.</p>}
        </section>
      )}

      {deleted.length > 0 && (
        <section aria-label="Excluídos" className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-pine-900">Excluídos</h2>
            <p className="text-sm text-muted">Fora da lista e do saldo. Restaure para trazer de volta.</p>
          </div>
          <ul className="divide-y divide-line">
            {deleted.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium [overflow-wrap:anywhere]">{t.description}</p>
                  <p className="text-sm text-muted">
                    {t.type === "input" ? "Receita" : "Despesa"} · <Money cents={t.value} /> · {categoryLabel(t.type, t.category, custom)} · excluído em{" "}
                    {inBrasilia(t.deletedAt).format("DD/MM/YYYY [às] HH:mm")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(t)}
                  disabled={busy !== ""}
                  aria-label={`Restaurar ${t.description}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-mint-100 px-3.5 text-sm font-semibold text-pine-900 transition hover:bg-mint-300/60 disabled:opacity-60 [--icon-accent:currentColor]"
                >
                  <Icon name="renovar" className="size-5" />
                  {busy === t.id ? "Restaurando…" : "Restaurar"}
                </button>
              </li>
            ))}
          </ul>
          {result?.deletedTruncated && <p className="border-t border-line px-5 py-3 text-sm text-muted">Mostrando os 200 excluídos mais recentes. Ao restaurar, os mais antigos aparecem aqui.</p>}
        </section>
      )}

      <section aria-label="Alterações" className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        {!result ? (
          <p role="status" className="px-5 py-8 text-center text-muted">
            Carregando histórico…
          </p>
        ) : events?.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <span className="grid size-16 place-items-center rounded-md bg-mint-100 text-pine-900">
              <Icon name="relogio" className="size-9" />
            </span>
            <p className="font-medium">Nada registrado ainda</p>
            <p className="max-w-xs text-sm text-muted">Quando você criar, editar ou excluir um lançamento, ele aparece aqui.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {events?.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded-md px-2.5 py-0.5 text-xs font-semibold ${BADGE[e.action]}`}>{ACTION_LABEL[e.action]}</span>
                  <p className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{e.snapshot.description}</p>
                  <time dateTime={e.at} className="shrink-0 text-sm text-muted">
                    {inBrasilia(e.at).format("DD/MM [às] HH:mm")}
                  </time>
                </div>
                <div className="text-sm text-muted sm:ml-[5.25rem]">
                  {e.action === "edited" ? (
                    <ul>
                      {e.changes.map((c) => (
                        <li key={c.field}>{describeChange(c, e.snapshot.type, custom, hidden)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {e.snapshot.type === "input" ? "Receita" : "Despesa"} · {describeSnapshot(e.snapshot, custom, hidden)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {result?.truncated && <p className="border-t border-line px-5 py-3 text-sm text-muted">Mostrando as 100 alterações mais recentes. Os excluídos e os arquivados aparecem nas seções acima.</p>}
      </section>
    </div>
  );
}
