import { NavLink, useLocation } from "react-router-dom";
import Icon from "./Icon.jsx";

// Navegação principal, sempre visível na faixa verde do topo (no celular, ícone em cima do nome).
// Início também fica marcado em Nova receita, Nova despesa e Editar, que são parte dele.
const ITEMS = [
  { to: "/", label: "Início", icon: "carteira", also: ["/transaction"] },
  { to: "/analysis", label: "Análise", icon: "grafico" },
  { to: "/categories", label: "Categorias", icon: "categorias" },
  { to: "/history", label: "Histórico", icon: "relogio" },
  { to: "/account", label: "Conta", icon: "pessoa" },
];

const base =
  "flex flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition [--icon-accent:currentColor] sm:flex-row sm:gap-2 sm:px-3.5 sm:text-sm";

export default function MainNav() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Principal" className="mx-auto grid max-w-3xl grid-cols-5 gap-1 px-3 pb-2 sm:flex sm:px-4">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => {
            const active = isActive || item.also?.some((p) => pathname.startsWith(p));
            return `${base} ${active ? "bg-white/15 text-white" : "text-mint-300 hover:bg-white/10 hover:text-white"}`;
          }}
        >
          <Icon name={item.icon} className="size-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
