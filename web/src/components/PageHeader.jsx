import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";

// Título da página dentro da faixa verde do topo (como o saldo na página inicial); os cartões da
// página sobem sobre a borda da faixa. Sem o AppShell (testes isolados) aparece no lugar.
export default function PageHeader({ title, subtitle, children }) {
  const outlet = useOutletContext();
  const header = (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-3 text-white">
      <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
      {subtitle && <p className="mt-1 text-mint-300">{subtitle}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
  if (outlet) return outlet.heroSlot ? createPortal(header, outlet.heroSlot) : null;
  return <div className="on-dark mb-5 rounded-lg bg-pine-900">{header}</div>;
}
