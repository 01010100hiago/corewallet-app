import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { categoryLabel } from "@corewallet/shared";
import Icon from "./Icon.jsx";
import ErrorMessage from "./ErrorMessage.jsx";
import Money from "./Money.jsx";
import { usePrivacy } from "../context/privacyContext.js";
import { moneyText } from "../lib/format.js";
import TransactionHistory from "./TransactionHistory.jsx";
import { inBrasilia } from "../lib/brasilia.js";

const action =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-pine-900 transition hover:bg-mint-100 [--icon-accent:currentColor]";

// Uma linha da lista, com editar, excluir, arquivar e histórico. Excluir pede confirmação na
// própria linha e só some da tela depois de a API confirmar; arquivar é reversível e não pede.
export default function TransactionRow({ transaction: t, onDelete, onArchive, categories = [] }) {
  const input = t.type === "input";
  const { hidden } = usePrivacy();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const groupRef = useRef(null);
  const deleteRef = useRef(null);
  const wasConfirming = useRef(false);

  // O botão que tinha o foco sai da tela quando a confirmação abre (e vice-versa):
  // o foco vai para a confirmação e, ao cancelar, volta para o botão Excluir.
  useEffect(() => {
    if (confirming) groupRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      await onDelete(t);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="px-5 py-3.5 transition hover:bg-canvas/60">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-md ${input ? "bg-mint-100 text-pine-900" : "bg-coral-100 text-coral-800"}`}>
          <Icon name={input ? "entrada" : "saida"} className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium [overflow-wrap:anywhere]">{t.description}</span>
          <span className="text-sm text-muted">
            {categoryLabel(t.type, t.category, categories)} ·{" "}
            <time dateTime={t.createdAt} title={`Registrado em ${inBrasilia(t.createdAt).format("DD/MM/YYYY [às] HH:mm:ss")} (horário de Brasília)`}>
              {inBrasilia(t.createdAt).format("HH:mm")}
            </time>
          </span>
        </span>
        <span className={`tabular shrink-0 font-semibold ${input ? "text-positive" : "text-negative"}`}>
          {!input && "− "}
          <Money cents={t.value} />
        </span>
      </div>

      {confirming ? (
        <div ref={groupRef} tabIndex={-1} role="group" aria-label={`Excluir ${t.description}`} className="mt-3 flex flex-col gap-2 rounded-lg bg-coral-100/60 p-3 sm:ml-[3.25rem]">
          <p className="text-sm text-coral-950">
            Excluir “{t.description}” de {moneyText(t.value, hidden)}? Ele sai da lista e do saldo, mas fica no histórico e dá para restaurar.
          </p>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={action}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-negative px-3 text-sm font-semibold text-white transition hover:bg-coral-800 disabled:opacity-60"
            >
              {busy ? "Excluindo…" : "Sim, excluir"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1 sm:ml-[3.25rem]">
          <Link to={`/transaction/${t.id}/edit`} className={action} aria-label={`Editar ${t.description}`}>
            <Icon name="editar" className="size-5" />
            Editar
          </Link>
          <button ref={deleteRef} type="button" onClick={() => setConfirming(true)} className={action} aria-label={`Excluir ${t.description}`}>
            <Icon name="lixeira" className="size-5" />
            Excluir
          </button>
          <button type="button" onClick={() => onArchive(t)} className={action} aria-label={`Arquivar ${t.description}`}>
            <Icon name="arquivar" className="size-5" />
            Arquivar
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            aria-controls={`history-${t.id}`}
            aria-label={`Histórico de ${t.description}`}
            className={action}
          >
            <Icon name="relogio" className="size-5" />
            Histórico
          </button>
        </div>
      )}
      {showHistory && (
        <div id={`history-${t.id}`} className="mt-3 sm:ml-[3.25rem]">
          <TransactionHistory transactionId={t.id} categories={categories} />
        </div>
      )}
    </li>
  );
}
