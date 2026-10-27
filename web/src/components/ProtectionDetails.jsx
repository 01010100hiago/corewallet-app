import Icon from "./Icon.jsx";

// Só afirma o que o sistema faz de verdade hoje.
const FACTS = [
  { icon: "senha", text: "Sua senha nunca é guardada. Fica só uma versão embaralhada (bcrypt), que não volta ao original." },
  { icon: "cookie", text: "O acesso fica num cookie que o JavaScript da página não consegue ler." },
  { icon: "cadeado", text: "Cada pessoa vê apenas os próprios lançamentos." },
  { icon: "relogio", text: "A sessão vence sozinha depois de 1 hora." },
];

export default function ProtectionDetails() {
  return (
    <details className="group mt-8 rounded-md border border-line bg-white p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-pine-900">
        <Icon name="escudo" className="size-5" />
        Como protegemos seus dados
        <span className="ml-auto text-muted transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="mt-3 flex flex-col gap-3 text-muted">
        {FACTS.map((f) => (
          <li key={f.icon} className="flex gap-3">
            <Icon name={f.icon} className="mt-0.5 size-5 shrink-0 text-pine-900" />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
