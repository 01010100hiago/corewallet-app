import { Link, useLocation } from "react-router-dom";
import Icon from "./Icon.jsx";

// Início também vale em Nova receita, Nova despesa e Editar, que são parte dele; Categorias é parte
// da Conta (configuração, não uso diário) e abre por lá.
const ITEMS = [
  { to: "/", icon: "carteira", title: "Início", also: ["/transaction"] },
  { to: "/analysis", icon: "grafico", title: "Análise" },
  { to: "/history", icon: "relogio", title: "Histórico" },
  { to: "/account", icon: "pessoa", title: "Conta", also: ["/categories"] },
];

const isActive = (item, pathname) =>
  item.to === "/"
    ? pathname === "/" || item.also.some((p) => pathname.startsWith(p))
    : pathname === item.to || pathname.startsWith(`${item.to}/`) || Boolean(item.also?.some((p) => pathname.startsWith(p)));

// A navegação principal do app: os MESMOS quatro botões, no mesmo lugar, em todas as páginas; só
// muda qual está marcado. No celular, sem borda (só o ícone e o nome animam); do tamanho "sm" para
// cima, cada botão vira um cartão. O efeito (ícone cresce e vira verde, um brilho cruza o cartão)
// só aparece com o mouse ou o foco do teclado e é desligado para quem pede menos movimento.
export default function Shortcuts() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Principal" className="relative z-10 grid grid-cols-4 gap-1 rounded-lg bg-white p-2 shadow-md sm:gap-3 sm:border sm:border-line sm:p-3">
      {ITEMS.map((item) => {
        const current = isActive(item, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={current ? "page" : undefined}
            className={`group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-lg border border-transparent px-0.5 py-2 text-center transition duration-300 ease-out sm:px-1 sm:py-2.5 sm:hover:border-pine-700/40 sm:hover:shadow-lg sm:focus-visible:border-pine-700/40 sm:focus-visible:shadow-lg sm:motion-safe:hover:-translate-y-1 sm:motion-safe:focus-visible:-translate-y-1 ${
              current ? "sm:border-pine-700/50 sm:bg-mint-50" : "sm:border-line sm:bg-white"
            }`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/2 hidden w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-mint-100/80 to-transparent opacity-0 transition duration-700 ease-out sm:block motion-safe:group-hover:translate-x-[320%] motion-safe:group-hover:opacity-100"
            />
            <span
              className={`relative grid size-11 place-items-center rounded-xl shadow-inner transition duration-300 ease-out [--icon-accent:var(--color-coral-500)] group-hover:bg-pine-900 group-hover:text-white group-hover:[--icon-accent:var(--color-mint-300)] group-focus-visible:bg-pine-900 group-focus-visible:text-white group-focus-visible:[--icon-accent:var(--color-mint-300)] sm:size-14 sm:rounded-2xl motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-3 motion-safe:group-active:scale-95 ${
                current ? "bg-pine-900 text-white [--icon-accent:var(--color-mint-300)]" : "bg-mint-100 text-pine-900"
              }`}
            >
              <Icon name={item.icon} className="size-6 sm:size-8" />
            </span>
            <span className="relative block text-xs font-semibold text-pine-900 transition duration-300 group-hover:text-pine-700 sm:text-sm motion-safe:group-hover:-translate-y-0.5">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
