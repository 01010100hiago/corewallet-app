import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";
export const ACCESS_TTL_SECONDS = 60 * 60;

export function signAccessToken(userId, secret) {
  return jwt.sign({ sub: String(userId) }, secret, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

// Devolve { userId, startedAt, expiresAt } (datas ISO) ou null se o token for
// inválido ou estiver vencido.
export function verifyAccessToken(token, secret) {
  try {
    return sessionFromPayload(jwt.verify(token, secret, { algorithms: [ALGORITHM] }));
  } catch {
    return null;
  }
}

// O token que acabou de ser assinado também precisa informar quando vence.
export function readSession(token) {
  return sessionFromPayload(jwt.decode(token));
}

function sessionFromPayload(payload) {
  if (typeof payload?.sub !== "string" || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) {
    return null;
  }
  return {
    userId: payload.sub,
    startedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}
