import { monthLabel } from "@corewallet/shared";
import Icon from "./Icon.jsx";

const arrow =
  "grid size-11 place-items-center rounded-xl text-pine-900 transition hover:bg-mint-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

// Troca de mês: anterior, próximo (não passa do mês atual) e atalho para voltar ao atual.
export default function MonthNav({ month, current, onChange, previous, next }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={arrow} onClick={() => onChange(previous)} aria-label="Mês anterior">
        <Icon name="voltar" className="size-6" />
      </button>
      <div className="min-w-0 text-center">
        <h2 aria-live="polite" className="text-lg font-semibold text-pine-900 first-letter:uppercase">
          {monthLabel(month)}
        </h2>
        {month !== current && (
          <button type="button" onClick={() => onChange(current)} className="rounded-lg px-2 py-0.5 text-sm font-medium text-pine-700 underline underline-offset-4 hover:bg-mint-100">
            Ir para o mês atual
          </button>
        )}
      </div>
      <button type="button" className={arrow} onClick={() => onChange(next)} disabled={month >= current} aria-label="Próximo mês">
        <Icon name="voltar" className="size-6 rotate-180" />
      </button>
    </div>
  );
}
