import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";
// O token de acesso é curto de propósito: quem o copiar tem poucos minutos. A
// sessão em si dura mais e é renovada com o token de renovação (ver sessionService).
export const ACCESS_TTL_SECONDS = 15 * 60;

export function signAccessToken(userId, sessionId, secret) {
  return jwt.sign({ sub: String(userId), sid: String(sessionId) }, secret, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

// Devolve { userId, sessionId, expiresAt } ou null se o token for inválido ou vencido.
export function verifyAccessToken(token, secret) {
  try {
    return fromPayload(jwt.verify(token, secret, { algorithms: [ALGORITHM] }));
  } catch {
    return null;
  }
}

// Quando o token recém-assinado vence (ISO).
export function accessExpiry(token) {
  return fromPayload(jwt.decode(token))?.expiresAt ?? null;
}

function fromPayload(payload) {
  if (typeof payload?.sub !== "string" || typeof payload?.sid !== "string" || !Number.isFinite(payload.exp)) return null;
  return { userId: payload.sub, sessionId: payload.sid, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
