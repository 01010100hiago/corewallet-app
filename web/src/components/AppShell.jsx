import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import Logo from "./Logo.jsx";
import SessionChip from "./SessionChip.jsx";

// Moldura das telas de dentro do app: barra no topo e conteúdo centralizado.
// Na página inicial a barra e o saldo formam uma faixa verde só: a barra fica sem fundo
// próprio e a Home entrega o cartão do saldo para o espaço logo abaixo dela (heroSlot).
export default function AppShell() {
  const home = useLocation().pathname === "/";
  const [heroSlot, setHeroSlot] = useState(null);

  return (
    <div className="min-h-screen">
      <div className={home ? "on-dark rounded-b-xl bg-pine-900 bg-[radial-gradient(48rem_24rem_at_100%_0%,rgba(31,122,93,0.7),transparent_60%)]" : ""}>
        {/* relative z-20: o painel "Sessão protegida" precisa ficar acima do cartão de novo lançamento, que sobe sobre a faixa verde. */}
        <header className={`relative z-20 ${home ? "" : "border-b border-line bg-white"}`}>
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link to="/" aria-label="CoreWallet, início" className="rounded-md">
              <Logo tone={home ? "light" : "dark"} />
            </Link>
            <SessionChip onDark={home} />
          </div>
        </header>
        {home && <div ref={setHeroSlot} />}
      </div>
      <main className={`mx-auto max-w-3xl px-4 ${home ? "pb-8" : "py-6 sm:py-8"}`}>
        <Outlet context={{ heroSlot }} />
      </main>
    </div>
  );
}
