import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext.js";
import { useConfig } from "../context/configContext.js";
import { getErrorMessage } from "../lib/api.js";
import GoogleButton from "./GoogleButton.jsx";
import OrDivider from "./OrDivider.jsx";
import SecuritySplash from "./SecuritySplash.jsx";
import { connectionStep } from "../lib/connection.js";

// Botão do Google com a tela de carregamento de segurança enquanto a API confirma
// o token. Some por completo se o login com Google não estiver ligado na API.
export default function GoogleSection({ onError }) {
  const { google } = useConfig();
  const { googleSignin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!google) return null;

  async function handleCredential(credential) {
    setBusy(true);
    onError("");
    try {
      await googleSignin(credential);
      // Quem entrou pela primeira vez cai na tela "Complete seu perfil" pelo guarda de rota.
      navigate("/", { replace: true });
    } catch (error) {
      onError(getErrorMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {busy && (
        <SecuritySplash
          fullScreen={false}
          title="Entrando com o Google"
          steps={[
            connectionStep(window.location),
            { label: "Confirmando sua conta com o Google…", state: "active" },
            { label: "Abrindo sua sessão", state: "pending" },
          ]}
        />
      )}
      <GoogleButton clientId={google.clientId} onCredential={handleCredential} />
      <OrDivider />
    </div>
  );
}
