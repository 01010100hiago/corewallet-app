import LogoMark from "./LogoMark.jsx";

// Marca + nome. tone="dark": texto escuro, para fundo claro.
// tone="light": texto claro e marca invertida, para fundo verde.
export default function Logo({ tone = "dark", className = "" }) {
  const light = tone === "light";
  return (
    <span className={`inline-flex items-center gap-2.5 text-2xl tracking-tight ${light ? "text-mint-50" : "text-pine-900"} ${className}`}>
      <LogoMark tone={light ? "light" : "dark"} className="size-9" />
      <span>
        <span className="font-semibold">Core</span>
        <span className="font-light">Wallet</span>
      </span>
    </span>
  );
}
