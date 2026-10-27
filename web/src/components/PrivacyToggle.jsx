import { usePrivacy } from "../context/privacyContext.js";
import Icon from "./Icon.jsx";

// Olhinho da barra do topo: esconde ou mostra todos os valores em dinheiro do app.
export default function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label="Ocultar valores"
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      className="grid size-10 place-items-center rounded-md bg-white/12 text-white transition hover:bg-white/20 [--icon-accent:currentColor]"
    >
      <Icon name={hidden ? "ocultar" : "mostrar"} className="size-5" />
    </button>
  );
}
