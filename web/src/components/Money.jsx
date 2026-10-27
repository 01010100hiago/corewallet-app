import { formatCents } from "@corewallet/shared";
import { usePrivacy } from "../context/privacyContext.js";
import { MASKED_MONEY } from "../lib/format.js";

// Valor em dinheiro (centavos). Com o modo "esconder valores" ligado mostra "R$ ••••"; o leitor
// de tela lê "valor oculto" em vez dos pontos.
export default function Money({ cents }) {
  const { hidden } = usePrivacy();
  if (!hidden) return formatCents(cents);
  return (
    <>
      <span aria-hidden="true">{MASKED_MONEY}</span>
      <span className="sr-only">valor oculto</span>
    </>
  );
}
