import { categoryLabel, formatCents } from "@corewallet/shared";
import Icon from "./Icon.jsx";

// "Para onde foi o dinheiro": saídas do mês por categoria, da maior para a menor.
// É uma lista (texto lido por leitor de tela); as barras são só reforço visual.
// Largura por atributo do SVG, não por style, para não depender de CSP.
export default function SpendingChart({ categories }) {
  const rows = categories.filter((c) => c.type === "output");
  const total = rows.reduce((n, r) => n + r.total, 0);
  if (total === 0) return null;
  const max = rows[0].total;

  return (
    <section aria-labelledby="chart-title" className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <h2 id="chart-title" className="flex items-center gap-2 text-lg font-semibold text-pine-900">
        <Icon name="grafico" className="size-6" />
        Para onde foi o dinheiro
      </h2>
      <ul className="mt-4 flex flex-col gap-3.5">
        {rows.map((row, i) => {
          const share = Math.round((row.total / total) * 100);
          return (
            <li key={row.category}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{categoryLabel("output", row.category)}</span>
                <span className="tabular text-muted">
                  <span className="font-semibold text-ink">{formatCents(row.total)}</span> · {share}%
                </span>
              </div>
              <svg aria-hidden="true" className="mt-1.5 h-2.5 w-full" preserveAspectRatio="none">
                <rect width="100%" height="100%" rx="5" className="fill-mint-100" />
                <rect width={`${Math.max((row.total / max) * 100, 2)}%`} height="100%" rx="5" className={i === 0 ? "fill-coral-500" : "fill-pine-700"} />
              </svg>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
