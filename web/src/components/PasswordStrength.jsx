import { evaluatePassword } from "@corewallet/shared";
import Icon from "./Icon.jsx";

const SEGMENT_COLORS = ["", "bg-negative", "bg-coral-500", "bg-pine-700", "bg-pine-900"];

export const PASSWORD_RULES_ID = "password-rules";

// Medidor e checklist da senha. Usa as mesmas regras que a API aplica no cadastro.
// O estado de cada regra é dito em texto (não só por cor e ícone), e o campo de
// senha aponta para esta lista por aria-describedby.
export default function PasswordStrength({ password }) {
  const { checks, score, label } = evaluatePassword(password);

  return (
    <div id={PASSWORD_RULES_ID} className="flex flex-col gap-2.5 rounded-md bg-mint-100/60 p-3.5">
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Força da senha"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={score}
          aria-valuetext={label || "Digite uma senha"}
          className="flex flex-1 gap-1.5"
        >
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-sm transition-colors ${n <= score ? SEGMENT_COLORS[score] : "bg-line"}`} />
          ))}
        </div>
        <span aria-hidden="true" className="w-16 text-right text-sm font-medium text-ink">
          {label}
        </span>
      </div>
      {/* Anuncia só a nota, e só quando ela muda, em vez de ler a lista inteira a cada tecla. */}
      <p role="status" className="sr-only">
        {label ? `Força da senha: ${label}` : ""}
      </p>
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.id} className={`flex items-center gap-2 [--icon-accent:currentColor] ${c.ok ? "text-pine-900" : "text-muted"}`}>
            <Icon name={c.ok ? "ok" : "pendente"} className="size-[18px] shrink-0" />
            <span>
              {c.label}
              {!c.required && <span className="text-muted"> (recomendado)</span>}
              <span className="sr-only">{c.ok ? ": atendido" : ": pendente"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
