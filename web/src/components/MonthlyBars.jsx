import { monthShort, monthShortWithYear, compactText, niceMax } from "../lib/format.js";
import { usePrivacy } from "../context/privacyContext.js";
import Money from "./Money.jsx";

const W = 640;
const H = 260;
const M = { top: 14, right: 10, bottom: 30, left: 62 };
const TICKS = 4;

// Receitas e despesas lado a lado, mês a mês. O desenho é só reforço visual: os valores exatos
// estão na tabela logo abaixo (dentro de "Ver valores em tabela"), que é o que o leitor de tela lê.
export default function MonthlyBars({ months }) {
  const { hidden } = usePrivacy();
  const top = niceMax(Math.max(...months.flatMap((m) => [m.totalIn, m.totalOut]), 1));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const group = plotW / months.length;
  const barW = Math.min(group * 0.3, 26);
  const y = (v) => M.top + plotH - (v / top) * plotH;

  return (
    <div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Legenda">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-pine-700" /> Receitas
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-coral-500" /> Despesas
        </li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de barras de receitas e despesas por mês. Os valores estão na tabela abaixo." className="mt-3 h-auto w-full">
        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const v = (top / TICKS) * i;
          return (
            <g key={i}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} strokeWidth="1" className={i === 0 ? "stroke-sage-300" : "stroke-line"} />
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-muted">
                {i === 0 ? "0" : compactText(v, hidden)}
              </text>
            </g>
          );
        })}
        {months.map((m, i) => {
          const cx = M.left + group * i + group / 2;
          const label = i === 0 || m.key.endsWith("-01") ? monthShortWithYear(m.key) : monthShort(m.key);
          return (
            <g key={m.key}>
              <rect x={cx - barW - 2} y={y(m.totalIn)} width={barW} height={Math.max(M.top + plotH - y(m.totalIn), 0)} rx="1.5" className="fill-pine-700" />
              <rect x={cx + 2} y={y(m.totalOut)} width={barW} height={Math.max(M.top + plotH - y(m.totalOut), 0)} rx="1.5" className="fill-coral-500" />
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" className="fill-muted">
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <details className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded-md py-1 font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">Ver valores em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left">
            <caption className="sr-only">Receitas, despesas e resultado por mês</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">Mês</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Receitas</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Despesas</th>
                <th scope="col" className="py-1.5 text-right font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {months.map((m) => (
                <tr key={m.key}>
                  <th scope="row" className="py-1.5 pr-3 font-normal">{monthShortWithYear(m.key)}</th>
                  <td className="tabular py-1.5 pr-3 text-right"><Money cents={m.totalIn} /></td>
                  <td className="tabular py-1.5 pr-3 text-right"><Money cents={m.totalOut} /></td>
                  <td className={`tabular py-1.5 text-right font-medium ${m.totalIn - m.totalOut < 0 ? "text-negative" : "text-positive"}`}><Money cents={m.totalIn - m.totalOut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
