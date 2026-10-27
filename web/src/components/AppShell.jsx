import { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import Logo from "./Logo.jsx";
import Shortcuts from "./Shortcuts.jsx";
import SessionChip from "./SessionChip.jsx";

// Moldura das telas de dentro do app. A faixa verde do topo é a MESMA em todas as telas: marca,
// sessão. Abaixo dela cada página entrega o
// próprio cabeçalho (o saldo na página inicial, o título nas demais) pelo espaço heroSlot, e o
// conteúdo sobe sobre a borda da faixa.
export default function AppShell() {
  const [heroSlot, setHeroSlot] = useState(null);
  const bandRef = useRef(null);

  // A faixa verde acompanha a altura do cabeçalho da página (alta no início, que tem o saldo; baixa
  // nas outras) e anima a mudança. A altura é aplicada pelo CSSOM (element.style), que a política de
  // segurança do site permite, ao contrário de atributos style no HTML.
  useEffect(() => {
    const band = bandRef.current;
    if (!heroSlot || !band || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      band.style.height = `${heroSlot.getBoundingClientRect().height}px`;
    });
    observer.observe(heroSlot);
    return () => observer.disconnect();
  }, [heroSlot]);

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
              <SessionChip onDark />
            </div>
          </div>
        </header>
        <div ref={bandRef} className="overflow-hidden transition-[height] duration-300 ease-out">
          <div ref={setHeroSlot} />
        </div>
      </div>
      <main className="relative z-10 mx-auto -mt-12 max-w-3xl px-4 pb-8">
        <div className="mb-5">
          <Shortcuts />
        </div>
        <Outlet context={{ heroSlot }} />
      </main>
    </div>
  );
}
