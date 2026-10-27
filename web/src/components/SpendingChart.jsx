import { Link } from "react-router-dom";
import { categoryLabel } from "@corewallet/shared";
import Money from "./Money.jsx";
import { usePrivacy } from "../context/privacyContext.js";
import { moneyText } from "../lib/format.js";

// Cores das fatias, em ordem. As classes aparecem por extenso para o Tailwind enxergá-las.
const PALETTE = [
  { stroke: "stroke-coral-500", dot: "bg-coral-500" },
  { stroke: "stroke-pine-700", dot: "bg-pine-700" },
  { stroke: "stroke-bronze-500", dot: "bg-bronze-500" },
  { stroke: "stroke-pine-900", dot: "bg-pine-900" },
  { stroke: "stroke-mint-300", dot: "bg-mint-300" },
  { stroke: "stroke-clay-600", dot: "bg-clay-600" },
];
const OTHERS = { stroke: "stroke-sage-300", dot: "bg-sage-300" };
const MAX_SLICES = 6;
const GAP = 1.4; // espaço entre fatias, em % da volta

// O total no meio do anel nunca quebra: a letra diminui conforme o número cresce. Com folga para
// fontes mais largas (o Linux do CI desenha o mesmo texto ~5% maior que o macOS).
const centerSize = (text) => (text.length <= 9 ? "text-lg" : text.length <= 11 ? "text-base" : text.length <= 12 ? "text-sm" : text.length <= 14 ? "text-xs" : "text-[0.6rem]");

// Resumo dos gastos do mês: anel com o total no meio e legenda com valor e parte de cada
// categoria. Mais que MAX_SLICES categorias: as menores viram "Outras". O anel é só reforço
// visual (aria-hidden); a legenda é o texto que o leitor de tela lê. Medidas por atributo do
// SVG, não por style, para não depender da CSP.
export default function SpendingChart({ categories, custom = [] }) {
  const { hidden } = usePrivacy();
  const rows = categories.filter((c) => c.type === "output");
  const total = rows.reduce((n, r) => n + r.total, 0);
  if (total === 0) return null;

  const named = rows.map((r) => ({ key: r.category, label: categoryLabel("output", r.category, custom), total: r.total }));
  const shown = named.length > MAX_SLICES + 1 ? named.slice(0, MAX_SLICES) : named;
  const rest = named.slice(shown.length);
  const slices = [...shown, ...(rest.length ? [{ key: "outras", label: "Outras", total: rest.reduce((n, r) => n + r.total, 0), others: rest.length }] : [])].map((s, i) => ({
    ...s,
    color: s.others ? OTHERS : PALETTE[i % PALETTE.length],
    pct: (s.total / total) * 100,
  }));

  let offset = 0;
  const arcs = slices.map((s) => {
    const arc = { ...s, dash: Math.max(s.pct - (slices.length > 1 ? GAP : 0), 0.4), offset };
    offset += s.pct;
    return arc;
  });
  const totalText = moneyText(total, hidden);

  return (
    <section aria-labelledby="spending-title" className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="spending-title" className="text-lg font-semibold text-pine-900">
          Despesas por categoria
        </h2>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/categories" className="text-sm font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
            Gerenciar categorias
          </Link>
          <Link to="/analysis" className="text-sm font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">
            Ver análise financeira
          </Link>
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative size-44 shrink-0">
          <svg viewBox="0 0 100 100" aria-hidden="true" className="size-full">
            <circle cx="50" cy="50" r="38" fill="none" strokeWidth="13" className="stroke-mint-100" />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx="50"
                cy="50"
                r="38"
                fill="none"
                strokeWidth="13"
                strokeLinecap="butt"
                pathLength="100"
                strokeDasharray={`${a.dash} ${100 - a.dash}`}
                strokeDashoffset={-a.offset}
                transform="rotate(-90 50 50)"
                className={a.color.stroke}
              />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="text-xs text-muted">Total</span>
            <span data-testid="chart-total" className={`tabular whitespace-nowrap font-semibold text-pine-900 ${centerSize(totalText)}`}>
              <Money cents={total} />
            </span>
          </div>
        </div>

        <ul className="flex w-full min-w-0 flex-col gap-2.5">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <span aria-hidden="true" className={`size-3 shrink-0 rounded-full ${s.color.dot}`} />
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                {s.label}
                {s.others && <span className="font-normal text-muted"> ({s.others} categorias)</span>}
              </span>
              <span className="tabular shrink-0 text-right">
                <span className="font-semibold"><Money cents={s.total} /></span>
                <span className="ml-2 text-muted">{s.pct < 0.5 ? "<1%" : `${Math.round(s.pct)}%`}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
