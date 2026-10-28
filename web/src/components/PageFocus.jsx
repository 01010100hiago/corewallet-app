import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Ao trocar de página, leva o foco para o título (h1) da tela nova. Sem isso,
// quem usa teclado ou leitor de tela fica preso no ponto onde estava na tela anterior.
export default function PageFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector("h1");
      if (!heading) return;
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
