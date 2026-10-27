import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

const base =
  "[--icon-accent:currentColor] inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-coral-500 text-coral-950 hover:bg-coral-400",
  pine: "bg-pine-900 text-white hover:bg-pine-800",
  soft: "bg-mint-100 text-pine-900 hover:bg-mint-300/60",
  ghost: "text-pine-900 hover:bg-mint-100",
};

export function Button({ children, icon, variant = "primary", ...props }) {
  return (
    <button className={`${base} ${variants[variant]}`} {...props}>
      {icon && <Icon name={icon} className="size-5" />}
      {children}
    </button>
  );
}

// Navegação é link (não botão): funciona com clique do meio e leitor de tela.
export function LinkButton({ children, icon, to, variant = "primary" }) {
  return (
    <Link to={to} className={`${base} ${variants[variant]}`}>
      {icon && <Icon name={icon} className="size-5" />}
      {children}
    </Link>
  );
}
