import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../lib/api.js";
import { inBrasilia } from "../lib/brasilia.js";
import { ACTION_LABEL, describeChange, describeSnapshot } from "../lib/historyText.js";
import ErrorMessage from "./ErrorMessage.jsx";

// Eventos de um lançamento (criado, editado, excluído, restaurado), do mais novo para o mais antigo.
export default function TransactionHistory({ transactionId, categories }) {
  const [state, setState] = useState({ id: null });
  const current = state.id === transactionId ? state : null;

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/transactions/${transactionId}/history`)
      .then((res) => !cancelled && setState({ id: transactionId, events: res.data.events }))
      .catch((err) => !cancelled && setState({ id: transactionId, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  if (!current) {
    return (
      <p role="status" className="text-sm text-muted">
        Carregando histórico…
      </p>
    );
  }
  if (current.error) return <ErrorMessage>{current.error}</ErrorMessage>;

  if (current.events.length === 0) {
    return <p className="text-sm text-muted">Este lançamento é de antes do histórico existir. Só as próximas alterações aparecem aqui.</p>;
  }

  return (
    <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
      {current.events.map((e) => (
        <li key={e.id} className="text-sm">
          <p>
            <span className="font-semibold text-pine-900">{ACTION_LABEL[e.action]}</span>
            <span className="text-muted"> · {inBrasilia(e.at).format("DD/MM/YYYY [às] HH:mm")}</span>
          </p>
          {e.action === "edited" ? (
            <ul className="mt-0.5 text-muted">
              {e.changes.map((c) => (
                <li key={c.field}>{describeChange(c, e.snapshot.type, categories)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{describeSnapshot(e.snapshot, categories)}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
