import { monthShort, monthShortWithYear, formatCompact, niceMax, formatCents } from "../lib/format.js";

const W = 640;
const H = 220;
const M = { top: 16, right: 14, bottom: 30, left: 62 };

// Saldo no fim de cada mês (o saldo inicial do período mais o resultado de cada mês, em ordem).
// points: [{ key, balance }]. Valores exatos na tabela, dentro de "Ver valores em tabela".
export default function BalanceLine({ points }) {
  const values = points.map((p) => p.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const top = max > 0 ? niceMax(max) : 0;
  const bottom = min < 0 ? -niceMax(-min) : 0;
  const span = top - bottom || 100;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const x = (i) => (points.length === 1 ? M.left + plotW / 2 : M.left + (plotW / (points.length - 1)) * i);
  const y = (v) => M.top + plotH - ((v - bottom) / span) * plotH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const ticks = [...new Set([bottom, 0, top])].sort((a, b) => a - b);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de linha do saldo no fim de cada mês. Os valores estão na tabela abaixo." className="h-auto w-full">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} strokeWidth="1" className={v === 0 ? "stroke-sage-300" : "stroke-line"} />
            <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-muted">
              {v === 0 ? "0" : formatCompact(v)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-pine-700" />
        {points.map((p, i) => (
          <g key={p.key}>
            <circle cx={x(i)} cy={y(p.balance)} r="3.5" className={p.balance < 0 ? "fill-coral-500" : "fill-pine-700"} />
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" className="fill-muted">
              {i === 0 || p.key.endsWith("-01") ? monthShortWithYear(p.key) : monthShort(p.key)}
            </text>
          </g>
        ))}
      </svg>

      <details className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded-md py-1 font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700">Ver valores em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[16rem] text-left">
            <caption className="sr-only">Saldo no fim de cada mês</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">Fim de</th>
                <th scope="col" className="py-1.5 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map((p) => (
                <tr key={p.key}>
                  <th scope="row" className="py-1.5 pr-3 font-normal">{monthShortWithYear(p.key)}</th>
                  <td className={`tabular py-1.5 text-right font-medium ${p.balance < 0 ? "text-negative" : ""}`}>{formatCents(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
