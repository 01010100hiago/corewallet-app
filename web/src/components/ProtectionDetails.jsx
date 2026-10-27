import Icon from "./Icon.jsx";
import { useConfig } from "../context/configContext.js";

// Cada linha diz o que o sistema faz de verdade, em palavras de quem não é da área.
// Sem exagero: a conexão é criptografada (HTTPS), mas o servidor precisa ler os lançamentos para
// mostrar o saldo; por isso NÃO dizemos "criptografia de ponta a ponta".
const BASE = [
  { icon: "senha", lead: "Senha embaralhada.", text: "Nem nós conseguimos ler a sua." },
  { icon: "cadeado", lead: "Conexão criptografada.", text: "O que você envia viaja por HTTPS." },
  { icon: "escudo", lead: "Tudo é conferido de novo.", text: "O servidor valida o que o aparelho manda." },
  { icon: "computador", lead: "Você controla os acessos.", text: "Veja e encerre suas sessões a qualquer hora." },
];

export default function ProtectionDetails() {
  const { captcha } = useConfig();
  const facts = [
    ...BASE,
    captcha
      ? { icon: "atividade", lead: "Contra robôs.", text: "Verificação automática e limite de tentativas." }
      : { icon: "atividade", lead: "Limite de tentativas.", text: "Barra quem tenta adivinhar senhas." },
  ];

  return (
    <details className="group mt-8 rounded-md border border-line bg-white p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-2 text-center font-medium text-pine-900">
        <Icon name="escudo" className="size-5 shrink-0" />
        Como protegemos seus dados
        <span className="text-muted transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="mx-auto mt-4 flex max-w-xs flex-col gap-3 text-muted">
        {facts.map((f) => (
          <li key={f.lead} className="flex gap-3">
            <Icon name={f.icon} className="mt-0.5 size-5 shrink-0 text-pine-900" />
            <span>
              <strong className="font-semibold text-ink">{f.lead}</strong> {f.text}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
