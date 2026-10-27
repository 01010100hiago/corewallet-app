import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import Logo from "./Logo.jsx";
import MainNav from "./MainNav.jsx";
import PrivacyToggle from "./PrivacyToggle.jsx";
import SessionChip from "./SessionChip.jsx";

// Moldura das telas de dentro do app. A faixa verde do topo é a MESMA em todas as telas: marca,
// olhinho que esconde os valores, sessão e a navegação principal. Abaixo dela cada página entrega o
// próprio cabeçalho (o saldo na página inicial, o título nas demais) pelo espaço heroSlot, e o
// conteúdo sobe sobre a borda da faixa.
export default function AppShell() {
  const [heroSlot, setHeroSlot] = useState(null);

  return (
    <div className="min-h-screen">
      <div className="on-dark rounded-b-xl bg-pine-900 bg-[radial-gradient(48rem_24rem_at_100%_0%,rgba(31,122,93,0.7),transparent_60%)]">
        {/* relative z-20: o painel "Sessão protegida" precisa ficar acima do conteúdo, que sobe sobre a faixa verde. */}
        <header className="relative z-20">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link to="/" aria-label="CoreWallet, início" className="rounded-md">
              <Logo tone="light" />
            </Link>
            <div className="flex items-center gap-2">
              <PrivacyToggle />
              <SessionChip onDark />
            </div>
          </div>
          <MainNav />
        </header>
        <div ref={setHeroSlot} />
      </div>
      <main className="relative z-10 mx-auto -mt-12 max-w-3xl px-4 pb-8">
        <Outlet context={{ heroSlot }} />
      </main>
    </div>
  );
}
