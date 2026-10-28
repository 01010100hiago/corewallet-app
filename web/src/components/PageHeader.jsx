import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import PrivacyToggle from "./PrivacyToggle.jsx";

// Título da página dentro da faixa verde do topo (como o saldo na página inicial); os cartões da
// página sobem sobre a borda da faixa. O tamanho é SEMPRE o mesmo (uma linha de título, uma de
// subtítulo, cortada com reticências se for longa): a faixa não pode mudar de altura de uma página
// para outra por causa do texto. Sem o AppShell (testes isolados) aparece no lugar.
export default function PageHeader({ title, subtitle }) {
  const outlet = useOutletContext();
  const header = (
    <div className="cw-fade-in mx-auto max-w-3xl px-4 pb-16 pt-3 text-white">
      <div className="flex h-10 items-center justify-between gap-3">
        <h1 title={title} className="min-w-0 truncate text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <PrivacyToggle />
      </div>
      <p title={subtitle} className="mt-1 h-6 truncate text-mint-300">
        {subtitle}
      </p>
    </div>
  );
  if (outlet) return outlet.heroSlot ? createPortal(header, outlet.heroSlot) : null;
  return <div className="on-dark mb-5 rounded-lg bg-pine-900">{header}</div>;
}
