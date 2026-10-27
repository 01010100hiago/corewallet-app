import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { formatCents } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";
import { LinkButton } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";

export default function Home() {
  const { user, expire } = useAuth();
  usePageTitle("Início");
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(null); // null = ainda sem resposta da API
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/transactions")
      .then((res) => {
        if (cancelled) return;
        setTransactions(res.data.transactions);
        setBalance(res.data.balance);
        setTruncated(res.data.truncated);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) expire();
        else setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expire]);

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Saldo" className="on-dark rounded-3xl bg-pine-900 p-6 text-white sm:p-8">
        <h1 className="min-w-0 text-base font-normal text-mint-300 [overflow-wrap:anywhere]">Olá, {user?.name}</h1>
        <p className="mt-4 text-sm text-mint-300">Saldo</p>
        <p data-testid="balance" className={`tabular mt-1 text-4xl font-semibold sm:text-5xl ${balance !== null && balance < 0 ? "text-coral-400" : ""}`}>
          {balance === null ? "—" : formatCents(balance)}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LinkButton to="/transaction/input" icon="mais" variant="soft">
            Nova entrada
          </LinkButton>
          <LinkButton to="/transaction/output" icon="menos">
            Nova saída
          </LinkButton>
        </div>
      </section>

      <ErrorMessage>{error}</ErrorMessage>

      <section aria-label="Lançamentos" className="rounded-3xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-pine-900">Lançamentos</h2>
          {!loading && transactions.length > 0 && <span className="text-sm text-muted">{transactions.length} recentes</span>}
        </div>

        {loading ? (
          <p role="status" className="px-5 py-12 text-center text-muted">
            Carregando…
          </p>
        ) : transactions.length === 0 ? (
          !error && <EmptyState />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {transactions.map((t) => (
                <TransactionRow key={t.id} transaction={t} />
              ))}
            </ul>
            {truncated && (
              <p className="border-t border-line px-5 py-3 text-sm text-muted">
                Mostrando os {transactions.length} lançamentos mais recentes. O saldo considera todos.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TransactionRow({ transaction: t }) {
  const input = t.type === "input";
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${input ? "bg-mint-100 text-pine-900" : "bg-coral-100 text-coral-800"}`}>
        <Icon name={input ? "entrada" : "saida"} className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium [overflow-wrap:anywhere]">{t.description}</span>
        <time dateTime={t.createdAt} className="text-sm text-muted">
          {dayjs(t.createdAt).format("DD/MM [às] HH:mm")}
        </time>
      </span>
      <span className={`tabular shrink-0 font-semibold ${input ? "text-positive" : "text-negative"}`}>
        {!input && "− "}
        {formatCents(t.value)}
      </span>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-mint-100 text-pine-900">
        <Icon name="carteira" className="size-9" />
      </span>
      <p className="font-medium">Ainda não há entradas nem saídas</p>
      <p className="max-w-xs text-sm text-muted">Registre a primeira para acompanhar o seu saldo.</p>
    </div>
  );
}
