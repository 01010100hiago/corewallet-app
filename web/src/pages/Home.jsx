import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { isMonthKey, monthKeyOf, monthLabel, shiftMonth } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import { LinkButton } from "../components/Button.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import MonthNav from "../components/MonthNav.jsx";
import SpendingChart from "../components/SpendingChart.jsx";
import TransactionRow from "../components/TransactionRow.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";
import { dayLabel } from "../lib/days.js";
import { moneyText } from "../lib/format.js";
import { usePrivacy } from "../context/privacyContext.js";
import Money from "../components/Money.jsx";
import PrivacyToggle from "../components/PrivacyToggle.jsx";

function groupByDay(transactions, today) {
  const groups = [];
  for (const t of transactions) {
    const label = dayLabel(t.createdAt, today);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

export default function Home() {
  const { user, expire, now } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const listHeadingRef = useRef(null);
  usePageTitle("Início");
  const [params, setParams] = useSearchParams();
  // "Agora" é a hora do servidor (corrigida em AuthProvider), nunca a do celular ou do navegador:
  // um relógio errado no aparelho não pode mudar o mês aberto nem o "Hoje" e o "Ontem".
  const serverNow = now();
  const current = monthKeyOf(new Date(serverNow));
  // O mês fica na URL (?mes=2026-10): dá para voltar, recarregar e compartilhar.
  const requested = params.get("mes");
  const month = isMonthKey(requested) && requested <= current ? requested : current;
  const [result, setResult] = useState(null); // { month, data } | { month, error }
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState(location.state?.notice ? { text: location.state.notice } : null);
  const outlet = useOutletContext();

  // O aviso veio pelo estado da navegação, que sobrevive a F5 e ao botão voltar.
  // Depois de lido, limpa o estado para ele não reaparecer sem ação nova.
  useEffect(() => {
    if (location.state?.notice) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/transactions", { params: { month } })
      .then((res) => !cancelled && setResult({ month, data: res.data }))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) expire();
        else setResult({ month, error: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [month, reload, expire]);

  function changeMonth(next) {
    setNotice(null);
    setParams(next === current ? {} : { mes: next }, { replace: false });
  }

  async function deleteTransaction(t) {
    try {
      await api.delete(`/transactions/${t.id}`);
    } catch (err) {
      if (err.response?.status === 401) {
        expire();
        return;
      }
      // 404: já tinha sido excluído (outra aba); a lista só estava velha.
      if (err.response?.status !== 404) throw new Error(getErrorMessage(err), { cause: err });
    }
    setNotice({ text: "Lançamento excluído.", extra: "Ele continua no histórico.", undo: { kind: "restore", id: t.id } });
    setReload((n) => n + 1);
    // A linha excluída sai da tela com o foco dentro dela: leva o foco para o título da lista.
    listHeadingRef.current?.focus();
  }

  // Arquivar: sai da lista, mas continua contando no saldo, nos totais e no gráfico.
  async function archiveTransaction(t) {
    try {
      await api.post(`/transactions/${t.id}/archive`);
      setNotice({ text: "Lançamento arquivado.", extra: "Sai da lista, mas continua contando no saldo.", undo: { kind: "unarchive", id: t.id } });
      setReload((n) => n + 1);
      listHeadingRef.current?.focus();
    } catch (err) {
      if (err.response?.status === 401) return expire();
      // 404: já estava arquivado ou foi excluído em outra aba; a lista só estava velha.
      if (err.response?.status === 404) return setReload((n) => n + 1);
      setNotice({ text: `Não foi possível arquivar: ${getErrorMessage(err)}` });
    }
  }

  // Desfazer logo depois de excluir (restaura) ou de arquivar (desarquiva); tudo fica no histórico.
  const UNDO = {
    restore: { path: "restore", done: "Lançamento restaurado.", fail: "restaurar" },
    unarchive: { path: "unarchive", done: "Lançamento desarquivado.", fail: "desarquivar" },
  };
  async function undo({ kind, id }) {
    const step = UNDO[kind];
    try {
      await api.post(`/transactions/${id}/${step.path}`);
      setNotice({ text: step.done });
      setReload((n) => n + 1);
    } catch (err) {
      if (err.response?.status === 401) return expire();
      setNotice({ text: `Não foi possível ${step.fail}: ${getErrorMessage(err)}` });
    }
  }

  const ready = result?.month === month;
  const loading = !ready;
  const error = ready ? (result.error ?? "") : "";
  const data = ready ? (result.data ?? null) : null;
  const balance = data?.balance ?? null;
  const { hidden } = usePrivacy();
  const balanceText = balance === null ? "—" : moneyText(balance, hidden);
  const transactions = data?.transactions ?? [];
  const summary = data?.month ?? null;
  const customCategories = data?.categories ?? [];

  const hero = (
    <section aria-label="Saldo" className="cw-fade-in mx-auto max-w-3xl px-4 pb-16 pt-3 text-white">
      <h1 className="min-w-0 text-base font-normal text-mint-300 [overflow-wrap:anywhere]">Olá, {user?.name}</h1>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm text-mint-300">Saldo</p>
          {/* O olhinho vem logo depois do valor e acompanha a largura dele. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              data-testid="balance"
              className={`tabular font-semibold tracking-tight [overflow-wrap:anywhere] ${
                // Valores de milhões não cabem em letra grande num celular estreito.
                balanceText.length > 12 ? "text-3xl sm:text-5xl" : "text-4xl sm:text-5xl"
              } ${balance !== null && balance < 0 ? "text-coral-400" : ""}`}
            >
              {balance === null ? "—" : <Money cents={balance} />}
            </p>
            <PrivacyToggle />
          </div>
        </div>
        <div className="sm:w-80 sm:shrink-0">
          {/* Estes dois totais são só os de HOJE (dia do servidor, horário de Brasília); o saldo é o geral. */}
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-mint-300">
            Hoje{data?.today ? `, ${data.today.key.slice(8, 10)}/${data.today.key.slice(5, 7)}` : ""}
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <Stat label="Receitas de hoje" value={data?.today?.totalIn} icon="entrada" tone="in" />
            <Stat label="Despesas de hoje" value={data?.today?.totalOut} icon="saida" tone="out" />
          </dl>
        </div>
      </div>
    </section>
  );

  // Dentro do AppShell o saldo vai para a faixa verde do topo; sem ele (testes) fica aqui mesmo.
  let heroNode;
  if (outlet) heroNode = outlet.heroSlot ? createPortal(hero, outlet.heroSlot) : null;
  else heroNode = <div className="on-dark rounded-lg bg-pine-900 pt-3">{hero}</div>;

  return (
    <div className="flex flex-col gap-5">
      {heroNode}

      <section aria-label="Novo lançamento" className="relative z-10 grid gap-3 rounded-lg border border-line bg-white p-3 shadow-md sm:grid-cols-2">
        <LinkButton to="/transaction/input" icon="mais" variant="soft">
          Nova receita
        </LinkButton>
        <LinkButton to="/transaction/output" icon="menos">
          Nova despesa
        </LinkButton>
      </section>

      {notice && (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-mint-100 p-3.5 text-sm text-pine-900">
          <Icon name="ok" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span>{notice.text}</span>
            {notice.extra && <span className="text-pine-800"> {notice.extra}</span>}
          </span>
          {notice.undo && (
            <button type="button" onClick={() => undo(notice.undo)} className="rounded-md px-2 py-1 font-semibold underline underline-offset-4 hover:bg-white/60">
              Desfazer
            </button>
          )}
          <button type="button" onClick={() => setNotice(null)} className="rounded-md px-2 py-1 font-medium underline underline-offset-4 hover:bg-white/60">
            Fechar
          </button>
        </p>
      )}

      <ErrorMessage>{error}</ErrorMessage>

      <section aria-label="Mês" className="rounded-lg border border-line bg-white p-4 shadow-sm sm:p-5">
        <MonthNav month={month} current={current} previous={shiftMonth(month, -1)} next={shiftMonth(month, 1)} onChange={changeMonth} />
        <MonthResult summary={summary} hidden={hidden} />
        {summary?.archivedCount > 0 && (
          <p className="mt-3 text-sm text-muted">
            Os totais incluem {summary.archivedCount} {summary.archivedCount === 1 ? "lançamento arquivado" : "lançamentos arquivados"}, que não aparecem na lista.{" "}
            <Link to="/history?situacao=archived" className="font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
              Ver arquivados
            </Link>
          </p>
        )}
      </section>

      {summary && <SpendingChart categories={summary.categories} custom={customCategories} />}

      <section aria-label="Lançamentos" className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 ref={listHeadingRef} tabIndex={-1} className="text-lg font-semibold text-pine-900">
            Lançamentos
          </h2>
          {!loading && transactions.length > 0 && (
            <span className="text-sm text-muted">{data?.truncated && summary ? `${transactions.length} de ${summary.count}` : `${transactions.length} no mês`}</span>
          )}
        </div>

        {loading ? (
          <Skeleton />
        ) : transactions.length === 0 ? (
          !error && <EmptyState month={month} summary={Boolean(summary)} />
        ) : (
          <>
            {groupByDay(transactions, serverNow).map((group) => (
              <div key={group.label}>
                <h3 className="bg-canvas px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</h3>
                <ul className="divide-y divide-line">
                  {group.items.map((t) => (
                    <TransactionRow key={t.id} transaction={t} onDelete={deleteTransaction} onArchive={archiveTransaction} categories={customCategories} />
                  ))}
                </ul>
              </div>
            ))}
            {data.truncated && (
              <p className="border-t border-line px-5 py-3 text-sm text-muted">
                Mostrando os {transactions.length} lançamentos mais recentes do mês. O saldo e os totais consideram todos.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon, tone }) {
  // Uma linha por total, um embaixo do outro; o valor quebra de linha em vez de ser cortado.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-white/10 px-3.5 py-2.5 [--icon-accent:currentColor]">
      <Icon name={icon} className={`size-5 shrink-0 ${tone === "out" ? "text-coral-400" : "text-mint-300"}`} />
      <dt className="flex-1 text-mint-300">{label}</dt>
      <dd className="tabular min-w-0 font-semibold [overflow-wrap:anywhere]">{typeof value === "number" ? <Money cents={value} /> : "—"}</dd>
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Carregando lançamentos" className="divide-y divide-line">
      {[0, 1, 2].map((n) => (
        <div key={n} className="flex animate-pulse items-center gap-3 px-5 py-3.5">
          <span className="size-10 shrink-0 rounded-md bg-line" />
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

// Resumo do mês: o resultado em destaque, receitas e despesas em números grandes e uma barra
// mostrando a proporção entre elas (a barra some com os valores ocultos, para não vazar a proporção).
function MonthResult({ summary, hidden }) {
  const totalIn = summary?.totalIn;
  const totalOut = summary?.totalOut;
  const ready = typeof totalIn === "number" && typeof totalOut === "number";
  const result = ready ? totalIn - totalOut : null;
  const moved = ready ? totalIn + totalOut : 0;
  const share = moved > 0 ? Math.round((totalIn / moved) * 100) : 0;
  return (
    <>
      <div className="mt-5 text-center">
        <p className="text-sm text-muted">Resultado do mês</p>
        <p data-testid="month-result" className={`tabular mt-0.5 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-4xl ${result !== null && result < 0 ? "text-negative" : "text-pine-900"}`}>
          {result === null ? "—" : <Money cents={result} />}
        </p>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <MonthStat label="Receitas do mês" value={totalIn} icon="entrada" tone="in" />
        <MonthStat label="Despesas do mês" value={totalOut} icon="saida" tone="out" />
      </dl>
      {ready && moved > 0 && !hidden && (
        <div className="mt-4">
          <div className="overflow-hidden rounded-full">
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={`Receitas ${share}% e despesas ${100 - share}% do movimento do mês`} className="block h-2.5 w-full">
              <rect x="0" y="0" width={share} height="4" className="fill-pine-700" />
              <rect x={share} y="0" width={100 - share} height="4" className="fill-coral-500" />
            </svg>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Do movimento do mês: {share}% receitas e {100 - share}% despesas
          </p>
        </div>
      )}
    </>
  );
}

function MonthStat({ label, value, icon, tone }) {
  const out = tone === "out";
  return (
    <div className={`flex flex-col gap-2 rounded-lg px-4 py-4 ${out ? "bg-coral-100/70" : "bg-mint-100"}`}>
      <div className="flex items-center gap-2 [--icon-accent:currentColor]">
        <Icon name={icon} className={`size-6 shrink-0 ${out ? "text-coral-800" : "text-pine-700"}`} />
        <dt className="text-sm text-muted">{label}</dt>
      </div>
      <dd className={`tabular text-xl font-semibold [overflow-wrap:anywhere] sm:text-2xl ${out ? "text-negative" : "text-positive"}`}>{typeof value === "number" ? <Money cents={value} /> : "—"}</dd>
    </div>
  );
}

function EmptyState({ month, summary }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-md bg-mint-100 text-pine-900">
        <Icon name="carteira" className="size-9" />
      </span>
      <p className="font-medium">{summary ? `Nenhum lançamento em ${monthLabel(month)}` : "Nenhum lançamento registrado"}</p>
      <p className="max-w-xs text-sm text-muted">Registre um para acompanhar o seu saldo.</p>
    </div>
  );
}
