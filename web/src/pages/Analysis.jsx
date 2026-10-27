import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ANALYSIS_PERIODS, categoryLabel, monthLabel } from "@corewallet/shared";
import Money from "../components/Money.jsx";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import { inBrasilia } from "../lib/brasilia.js";
import { summarize, toneOf } from "../lib/analysis.js";
import { formatPercent, formatVariation, variation } from "../lib/format.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import MonthlyBars from "../components/MonthlyBars.jsx";
import BalanceLine from "../components/BalanceLine.jsx";

const card = "rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6";

// Análise financeira: evolução mês a mês, saldo ao longo do tempo, categorias com comparação ao
// período anterior e maiores despesas. Arquivados contam (continuam valendo); excluídos não.
export default function Analysis() {
  const { expire } = useAuth();
  usePageTitle("Análise financeira");
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("periodo"));
  const months = ANALYSIS_PERIODS.includes(requested) ? requested : 6;
  const [result, setResult] = useState(null); // { months, data } | { months, error }

  useEffect(() => {
    let cancelled = false;
    api
      .get("/analysis", { params: { months } })
      .then((res) => !cancelled && setResult({ months, data: res.data }))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) expire();
        else setResult({ months, error: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [months, expire]);

  const ready = result?.months === months;
  const data = ready ? result.data : null;
  const error = ready ? result.error : "";
  const s = data ? summarize(data) : null;
  const custom = data?.customCategories ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Análise financeira" subtitle={`Últimos ${months} meses`} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted">O mês atual está em andamento.</p>
        <div role="group" aria-label="Período" className="inline-flex rounded-md border border-line bg-white p-0.5 shadow-sm">
          {ANALYSIS_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === months}
              onClick={() => setParams(p === 6 ? {} : { periodo: String(p) })}
              className={`h-9 rounded px-3.5 text-sm font-medium transition ${p === months ? "bg-pine-900 text-white" : "text-pine-900 hover:bg-mint-100"}`}
            >
              {p} meses
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {!ready && (
        <p role="status" className="py-12 text-center text-muted">
          Carregando análise…
        </p>
      )}

      {s && !s.hasData && (
        <section className={`${card} flex flex-col items-center gap-3 py-12 text-center`}>
          <span className="grid size-14 place-items-center rounded-md bg-mint-100 text-pine-900">
            <Icon name="grafico" className="size-8" />
          </span>
          <p className="font-medium">Nenhum lançamento nos últimos {months} meses</p>
          <p className="max-w-sm text-sm text-muted">Registre receitas e despesas para acompanhar a evolução aqui.</p>
          <Link to="/" className="text-sm font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
            Ir para a página inicial
          </Link>
        </section>
      )}

      {s?.hasData && (
        <>
          <section aria-label="Indicadores do período">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Kpi label="Receitas" value={<Money cents={s.totalIn} />} change={s.changes.totalIn} good="up" />
              <Kpi label="Despesas" value={<Money cents={s.totalOut} />} change={s.changes.totalOut} good="down" />
              <Kpi label="Resultado" value={<Money cents={s.result} />} change={s.changes.result} good="up" negative={s.result < 0} />
              <Kpi label="Taxa de poupança" value={s.savingsRate === null ? "—" : formatPercent(s.savingsRate)} hint={s.savingsRate === null ? "Sem receitas no período" : "Do que entrou, quanto sobrou"} negative={s.savingsRate !== null && s.savingsRate < 0} />
              <Kpi label="Despesa média por mês" value={<Money cents={s.averageOut} />} hint={`Em ${months} meses, incluindo o atual`} />
            </dl>
            <p className="mt-2 text-sm text-muted">As variações comparam com os {months} meses anteriores.</p>
          </section>

          <section aria-labelledby="bars-title" className={card}>
            <h2 id="bars-title" className="mb-4 text-lg font-semibold text-pine-900">
              Receitas e despesas por mês
            </h2>
            <MonthlyBars months={data.months} />
          </section>

          <section aria-labelledby="balance-title" className={card}>
            <h2 id="balance-title" className="text-lg font-semibold text-pine-900">
              Evolução do saldo
            </h2>
            <p className="mb-4 text-sm text-muted">Saldo no fim de cada mês, a partir de <Money cents={data.openingBalance} /> no início do período.</p>
            <BalanceLine points={s.balances} />
          </section>

          {s.monthly && <MonthComparison monthly={s.monthly} />}

          <CategoryTable title="Despesas por categoria" type="output" rows={data.categories} custom={custom} good="down" />
          <CategoryTable title="Receitas por categoria" type="input" rows={data.categories} custom={custom} good="up" />

          {data.topExpenses.length > 0 && (
            <section aria-labelledby="top-title" className={card}>
              <h2 id="top-title" className="mb-3 text-lg font-semibold text-pine-900">
                Maiores despesas do período
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-left text-sm">
                  <caption className="sr-only">As {data.topExpenses.length} maiores despesas do período</caption>
                  <thead className="text-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">Data</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Descrição</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Categoria</th>
                      <th scope="col" className="py-2 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.topExpenses.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted">{inBrasilia(t.createdAt).format("DD/MM/YYYY")}</td>
                        <td className="py-2 pr-3 font-medium [overflow-wrap:anywhere]">{t.description}</td>
                        <td className="py-2 pr-3">{categoryLabel("output", t.category, custom)}</td>
                        <td className="tabular py-2 text-right font-semibold text-negative"><Money cents={t.value} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-sm text-muted">Inclui lançamentos arquivados e não inclui os excluídos. Os meses seguem o horário de Brasília.</p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, change, good, hint, negative }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`tabular mt-1 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] md:whitespace-nowrap ${negative ? "text-negative" : "text-pine-900"}`}>{value}</dd>
      {change !== undefined ? (
        <p className={`mt-1 text-xs font-medium ${toneOf(change, good)}`}>{formatVariation(change)}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

function MonthComparison({ monthly }) {
  return (
    <section aria-labelledby="compare-title" className={card}>
      <h2 id="compare-title" className="text-lg font-semibold text-pine-900">
        Mês atual e mês anterior
      </h2>
      <p className="mb-3 text-sm text-muted">
        {monthLabel(monthly.current.key)} (em andamento) comparado a {monthLabel(monthly.previous.key)}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-left text-sm">
          <caption className="sr-only">Comparação do mês atual com o anterior</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">&nbsp;</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Mês anterior</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Mês atual</th>
              <th scope="col" className="py-2 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {monthly.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="py-2 pr-3 font-medium">{r.label}</th>
                <td className="tabular py-2 pr-3 text-right"><Money cents={r.previous} /></td>
                <td className="tabular py-2 pr-3 text-right"><Money cents={r.current} /></td>
                <td className={`tabular py-2 text-right font-medium ${toneOf(r.change, r.good)}`}>{formatVariation(r.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryTable({ title, type, rows, custom, good }) {
  const list = rows.filter((r) => r.type === type);
  if (list.length === 0) return null;
  const total = list.reduce((n, r) => n + r.total, 0);
  const id = `cat-${type}`;
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="mb-3 text-lg font-semibold text-pine-900">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-left text-sm">
          <caption className="sr-only">{title} no período, com a variação sobre o período anterior</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Categoria</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Total</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Participação</th>
              <th scope="col" className="py-2 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => {
              const change = variation(r.total, r.previousTotal);
              return (
                <tr key={r.category}>
                  <th scope="row" className="py-2 pr-3 font-medium [overflow-wrap:anywhere]">{categoryLabel(type, r.category, custom)}</th>
                  <td className="tabular py-2 pr-3 text-right"><Money cents={r.total} /></td>
                  <td className="tabular py-2 pr-3 text-right text-muted">{formatPercent((r.total / total) * 100)}</td>
                  <td className={`tabular py-2 text-right font-medium ${toneOf(change, good)}`}>{r.previousTotal === 0 ? "novo no período" : formatVariation(change)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
