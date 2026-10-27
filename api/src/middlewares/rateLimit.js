import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const MIN = 60 * 1000;

// Limites por IP (e, no login, por IP + email). Ficam na memória da API: servem
// para uma instância só, que é o caso do lab. Com várias instâncias, troque o
// armazenamento por Redis.
export const DEFAULT_LIMITS = {
  general: { windowMs: 15 * MIN, limit: 600 },
  signup: { windowMs: 60 * MIN, limit: 10 },
  signin: { windowMs: 15 * MIN, limit: 30 },
  signinAccount: { windowMs: 15 * MIN, limit: 8 },
  google: { windowMs: 15 * MIN, limit: 30 },
  refresh: { windowMs: 15 * MIN, limit: 60 },
  challenge: { windowMs: 15 * MIN, limit: 60 },
};

const passthrough = (req, res, next) => next();

function make(options, extra = {}) {
  return rateLimit({
    ...options,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    },
    ...extra,
  });
}

// limits === false desliga tudo (usado só nos testes).
export function createLimiters(limits = DEFAULT_LIMITS) {
  if (limits === false) {
    return Object.fromEntries(["general", "signup", "signin", "signinAccount", "google", "refresh", "challenge"].map((k) => [k, passthrough]));
  }
  const l = { ...DEFAULT_LIMITS, ...limits };
  const emailKey = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? "").toLowerCase().slice(0, 254)}`;
  return {
    general: make(l.general),
    signup: make(l.signup),
    signin: make(l.signin),
    // Só erros contam, e a chave junta IP e email: errar a senha de alguém de outro
    // lugar não tranca a conta dessa pessoa.
    signinAccount: make(l.signinAccount, { skipSuccessfulRequests: true, keyGenerator: emailKey }),
    google: make(l.google),
    refresh: make(l.refresh),
    challenge: make(l.challenge),
  };
}
