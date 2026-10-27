import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { AuthError } from "./authService.js";

function sameSecret(a, b) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Confere o token ("credential") que o botão do Google entrega ao navegador:
// assinatura, emissor, validade e se foi emitido para ESTE aplicativo (audience).
// Também exige email verificado e o nonce que nós mesmos entregamos ao navegador,
// o que impede usar um token roubado ou de outra sessão.
export function createGoogleVerifier(clientId, client = new OAuth2Client()) {
  if (!clientId) return { enabled: false, verify: async () => { throw new AuthError("Login com o Google não está configurado", 503); } };

  return {
    enabled: true,
    async verify(credential, expectedNonce) {
      let payload;
      try {
        const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
        payload = ticket.getPayload();
      } catch {
        throw new AuthError("Não foi possível confirmar sua conta do Google. Tente de novo.", 401);
      }
      if (!payload?.sub || !payload.email) {
        throw new AuthError("Não foi possível confirmar sua conta do Google. Tente de novo.", 401);
      }
      if (payload.email_verified !== true) {
        throw new AuthError("O Google ainda não verificou o email desta conta.", 401);
      }
      if (!expectedNonce || typeof payload.nonce !== "string" || !sameSecret(payload.nonce, expectedNonce)) {
        throw new AuthError("A confirmação do Google expirou. Tente de novo.", 401);
      }
      return {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        name: typeof payload.name === "string" ? payload.name : "",
      };
    },
  };
}
