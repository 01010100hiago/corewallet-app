import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/authContext.js";
import { useConfig } from "../context/configContext.js";
import { connectionStep } from "../lib/connection.js";
import PageFocus from "./PageFocus.jsx";
import SecuritySplash from "./SecuritySplash.jsx";
import ConnectionProblem from "./ConnectionProblem.jsx";

// Tempo mínimo da tela de carregamento. Sem ele, quando tudo responde rápido a
// tela piscaria por uma fração de segundo, o que parece defeito.
const MIN_SPLASH_MS = 500;

// Cada passo reflete o resultado real da verificação, inclusive quando ela falha.
function sessionStep(status) {
  if (status === "loading") return { label: "Verificando sua sessão…", state: "active" };
  if (status === "error") return { label: "Não foi possível verificar a sessão", state: "warn" };
  return { label: "Sessão verificada", state: "done" };
}

function protectionsStep(status) {
  if (status === "loading") return { label: "Carregando proteções…", state: "active" };
  if (status === "error") return { label: "Proteções indisponíveis", state: "warn" };
  return { label: "Proteções carregadas", state: "done" };
}

// Mostra o splash de segurança enquanto a sessão e as proteções são verificadas.
export default function AppGate() {
  const { status, retry: retryAuth } = useAuth();
  const config = useConfig();
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  const pending = status === "loading" || config.status === "loading" || !minElapsed;

  if (pending) {
    return <SecuritySplash steps={[connectionStep(window.location), sessionStep(status), protectionsStep(config.status)]} />;
  }

  // Sem resposta do servidor não dá para saber se há captcha nem se a sessão vale:
  // melhor dizer isso e oferecer tentar de novo do que abrir um formulário que não funciona.
  if (status === "error" || config.status === "error") {
    return (
      <ConnectionProblem
        onRetry={() => {
          if (status === "error") retryAuth();
          if (config.status === "error") config.retry();
        }}
      />
    );
  }

  return (
    <>
      <PageFocus />
      <Outlet />
    </>
  );
}
