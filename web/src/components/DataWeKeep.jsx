import Icon from "./Icon.jsx";

// O que o sistema guarda de verdade (ver api/src/models). Mantenha em sincronia.
// Uma linha curta por item: o resumo é para ler rápido, não para virar manual.
const KEPT = [
  { icon: "pessoa", title: "Nome e email", text: "Para identificar a sua conta." },
  { icon: "senha", title: "Senha embaralhada", text: "Só de quem usa senha. Não volta ao original." },
  { icon: "chave", title: "ID da conta Google", text: "Só de quem entra com o Google." },
  { icon: "relogio", title: "Método e data de acesso", text: "Google ou senha, e quando a conta foi criada." },
  { icon: "computador", title: "Dispositivos com sessão", text: "Navegador, sistema, início do IP e último uso." },
  { icon: "atividade", title: "Lançamentos e categorias", text: "Valor, descrição, tipo, categoria e data." },
  { icon: "categorias", title: "Histórico de alterações", text: "O que você editou, arquivou ou excluiu." },
];

const NOT_KEPT = ["Senha em texto", "Dados de cartão ou banco", "Localização, telefone ou documentos", "Sua senha do Google"];

// Recolhido por padrão: a conta mostra o essencial e quem quer detalhes abre.
export default function DataWeKeep() {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-pine-900">
        <span>O que guardamos sobre você</span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="mt-4 grid gap-5 sm:grid-cols-[1.4fr_1fr]">
        <ul className="flex flex-col gap-2.5 text-sm">
          {KEPT.map((k) => (
            <li key={k.title} className="flex gap-3">
              <Icon name={k.icon} className="mt-0.5 size-5 shrink-0 text-pine-900" />
              <span>
                <strong className="font-medium">{k.title}.</strong> <span className="text-muted">{k.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div>
          <h3 className="text-sm font-semibold text-pine-900">O que não guardamos</h3>
          <ul className="mt-2.5 flex flex-col gap-2 text-sm text-muted">
            {NOT_KEPT.map((n) => (
              <li key={n} className="flex items-center gap-3">
                <Icon name="cadeado" className="size-5 shrink-0 text-pine-900" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-sm text-muted">Exportar seus dados e excluir a conta ainda não estão disponíveis.</p>
    </details>
  );
}
