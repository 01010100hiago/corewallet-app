import { Link, Outlet } from "react-router-dom";
import Logo from "./Logo.jsx";
import SessionChip from "./SessionChip.jsx";

// Moldura das telas de dentro do app: barra no topo e conteúdo centralizado.
export default function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="CoreWallet, início" className="rounded-lg">
            <Logo />
          </Link>
          <SessionChip />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
