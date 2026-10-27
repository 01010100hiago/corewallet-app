// Marca do CoreWallet: um "C" aberto (de Core) com uma moeda coral encaixada na
// abertura, como numa fenda de cofre. tone="dark" é o azulejo verde para fundo
// claro; tone="light" é a versão invertida para fundo verde.
export default function LogoMark({ tone = "dark", className = "size-9" }) {
  const dark = tone === "dark";
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" className={dark ? "fill-pine-900" : "fill-mint-50"} />
      <path
        d="M44.5 21.5 A15 15 0 1 0 44.5 42.5"
        className={`fill-none ${dark ? "stroke-mint-50" : "stroke-pine-900"}`}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <circle cx="44" cy="32" r="6.2" className="fill-coral-500" />
    </svg>
  );
}
