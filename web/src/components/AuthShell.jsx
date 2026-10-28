import { Outlet } from "react-router-dom";
import Logo from "./Logo.jsx";
import Icon from "./Icon.jsx";
import Illustration from "./Illustration.jsx";
import { connectionFact } from "../lib/connection.js";

const points = () => {
  const c = connectionFact(window.location);
  return [
    { icon: "senha", title: "Senha embaralhada", text: "Nem nós conseguimos ler a sua senha." },
    { icon: "cadeado", title: c.lead.replace(/\.$/, ""), text: c.text },
  ];
};

// Moldura das telas de acesso: painel de marca de um lado, formulário do outro.
export default function AuthShell() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="on-dark flex flex-col gap-6 bg-pine-900 bg-[radial-gradient(60rem_40rem_at_-10%_-10%,rgba(31,122,93,0.6),transparent_60%)] px-6 py-6 text-mint-50 lg:gap-10 lg:px-14 lg:py-12">
        <Logo tone="light" />
        <Illustration className="mx-auto hidden w-full max-w-md lg:block" />
        <div className="lg:mt-auto">
          <p className="text-2xl font-semibold leading-tight lg:text-4xl">
            Seu dinheiro em ordem,
            <br />
            sua conta protegida.
          </p>
          <ul className="mt-6 hidden flex-col gap-4 lg:flex">
            {points().map((p) => (
              <li key={p.icon} className="flex gap-3">
                <Icon name={p.icon} className="mt-0.5 size-6 shrink-0 text-mint-300" />
                <span>
                  <span className="block font-medium">{p.title}</span>
                  <span className="text-sm text-mint-300">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
