import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import dayjs from "dayjs";
import { formatCents } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import { LinkButton } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";
import { dayLabel } from "../lib/days.js";

function groupByDay(transactions) {
  const groups = [];
  for (const t of transactions) {
    const label = dayLabel(t.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

export default function Home() {
  const { user, expire } = useAuth();
  const location = useLocation();
  usePageTitle("Início");
  const [data, setData] = useState(null); // null = ainda sem resposta da API
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedVisible, setSavedVisible] = useState(Boolean(location.state?.saved));

  useEffect(() => {
    let cancelled = false;
    api
      .get("/transactions")
      .then((res) => !cancelled && setData(res.data))
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

  const balance = data?.balance ?? null;
  const transactions = data?.transactions ?? [];

  return (
    <div className="flex flex-col gap-5">
      {savedVisible && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-mint-100 p-3.5 text-sm text-pine-900">
          <Icon name="ok" className="size-5 shrink-0" />
          <span className="flex-1">Lançamento salvo.</span>
          <button type="button" onClick={() => setSavedVisible(false)} className="rounded-lg px-2 py-1 font-medium underline underline-offset-4 hover:bg-white/60">
            Fechar
          </button>
        </p>
      )}

      <section
        aria-label="Saldo"
        className="on-dark rounded-3xl bg-pine-900 bg-[radial-gradient(40rem_20rem_at_100%_0%,rgba(31,122,93,0.65),transparent_60%)] p-6 text-white shadow-sm sm:p-8"
      >
        <h1 className="min-w-0 text-base font-normal text-mint-300 [overflow-wrap:anywhere]">Olá, {user?.name}</h1>
        <p className="mt-4 text-sm text-mint-300">Saldo</p>
        <p data-testid="balance" className={`tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl ${balance !== null && balance < 0 ? "text-coral-400" : ""}`}>
          {balance === null ? "—" : formatCents(balance)}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Entradas" value={data?.totalIn} icon="entrada" />
          <Stat label="Saídas" value={data?.totalOut} icon="saida" />
        </dl>

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

      <section aria-label="Lançamentos" className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-pine-900">Lançamentos</h2>
          {!loading && transactions.length > 0 && <span className="text-sm text-muted">{transactions.length} recentes</span>}
        </div>

        {loading ? (
          <Skeleton />
        ) : transactions.length === 0 ? (
          !error && <EmptyState />
        ) : (
          <>
            {groupByDay(transactions).map((group) => (
              <div key={group.label}>
                <h3 className="bg-canvas px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</h3>
                <ul className="divide-y divide-line">
                  {group.items.map((t) => (
                    <TransactionRow key={t.id} transaction={t} />
                  ))}
                </ul>
              </div>
            ))}
            {data.truncated && (
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

function Stat({ label, value, icon }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-pine-800/70 px-4 py-3 [--icon-accent:currentColor]">
      <Icon name={icon} className="size-6 shrink-0 text-mint-300" />
      <div className="min-w-0">
        <dt className="text-mint-300">{label}</dt>
        <dd className="tabular truncate font-semibold">{typeof value === "number" ? formatCents(value) : "—"}</dd>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Carregando lançamentos" className="divide-y divide-line">
      {[0, 1, 2].map((n) => (
        <div key={n} className="flex animate-pulse items-center gap-3 px-5 py-3.5">
          <span className="size-10 shrink-0 rounded-full bg-line" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 w-1/2 rounded bg-line" />
            <span className="h-3 w-1/4 rounded bg-line" />
          </span>
          <span className="h-4 w-20 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

function TransactionRow({ transaction: t }) {
  const input = t.type === "input";
  return (
    <li className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-canvas/60">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${input ? "bg-mint-100 text-pine-900" : "bg-coral-100 text-coral-800"}`}>
        <Icon name={input ? "entrada" : "saida"} className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium [overflow-wrap:anywhere]">{t.description}</span>
        <time dateTime={t.createdAt} className="text-sm text-muted">
          {dayjs(t.createdAt).format("HH:mm")}
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
