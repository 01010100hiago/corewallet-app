import Icon from "./Icon.jsx";

// O que o sistema guarda de verdade (ver api/src/models). Mantenha em sincronia.
const KEPT = [
  { icon: "pessoa", title: "Seu nome", text: "Para te chamar pelo nome na tela." },
  { icon: "email", title: "Seu email", text: "Para identificar a sua conta. Nunca é mostrado a outras pessoas." },
  { icon: "senha", title: "Uma versão embaralhada da senha", text: "Só para quem criou conta com senha. Não dá para voltar ao original." },
  { icon: "chave", title: "O identificador da sua conta Google", text: "Só para quem entra com o Google, para reconhecer a mesma conta no próximo acesso." },
  { icon: "relogio", title: "Método e data de acesso", text: "O método de entrada (Google ou senha), se o email foi verificado e a data de criação da conta." },
  {
    icon: "computador",
    title: "Os dispositivos com sessão aberta",
    text: "Navegador e sistema, o começo do IP e o último uso. Some quando a sessão acaba (no máximo 30 dias) ou quando você a encerra.",
  },
  { icon: "atividade", title: "Seus lançamentos", text: "Valor, descrição, tipo e data de cada receita e despesa que você registra." },
];

const NOT_KEPT = ["Sua senha em texto", "Dados de cartão ou de banco", "Localização, telefone ou documentos", "Sua senha do Google (ela nunca chega até nós)"];

export default function DataWeKeep() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="font-semibold text-pine-900">O que guardamos</h3>
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {KEPT.map((k) => (
            <li key={k.title} className="flex gap-3">
              <Icon name={k.icon} className="mt-0.5 size-5 shrink-0 text-pine-900" />
              <span>
                <span className="block font-medium">{k.title}</span>
                <span className="text-muted">{k.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold text-pine-900">O que não guardamos</h3>
        <ul className="mt-3 flex flex-col gap-2.5 text-sm text-muted">
          {NOT_KEPT.map((n) => (
            <li key={n} className="flex items-center gap-3">
              <Icon name="cadeado" className="size-5 shrink-0 text-pine-900" />
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
