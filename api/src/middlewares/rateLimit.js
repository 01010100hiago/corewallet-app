import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const MIN = 60 * 1000;

// Limites por IP (e, no login, por IP + email). Os contadores ficam no Mongo (lib/mongoRateLimitStore),
// então várias instâncias da API dividem o mesmo limite. Sem `storeFor`, cada limite usa a memória do
// processo (o padrão do express-rate-limit): só serve para uma instância, e para testes sem banco.
export const DEFAULT_LIMITS = {
  general: { windowMs: 15 * MIN, limit: 600 },
  signup: { windowMs: 60 * MIN, limit: 10 },
  signin: { windowMs: 15 * MIN, limit: 30 },
  signinAccount: { windowMs: 15 * MIN, limit: 8 },
  google: { windowMs: 15 * MIN, limit: 30 },
  refresh: { windowMs: 15 * MIN, limit: 60 },
  challenge: { windowMs: 15 * MIN, limit: 60 },
  twoFactor: { windowMs: 15 * MIN, limit: 20 },
  email: { windowMs: 15 * MIN, limit: 20 },
  emailTarget: { windowMs: 60 * MIN, limit: 5 },
};

const passthrough = (req, res, next) => next();

function make(options, extra = {}, store = undefined) {
  return rateLimit({
    ...options,
    ...(store ? { store } : {}),
    // Banco fora do ar: deixa passar. Sem banco nem login nem cadastro funcionam, então o limite não
    // protege nada nesse momento, e derrubar tudo com um erro só pioraria a indisponibilidade.
    passOnStoreError: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    },
    ...extra,
  });
}

// limits === false desliga tudo (usado só nos testes).
// `storeFor(nome)` devolve o armazenamento do limite com esse nome (um prefixo próprio para cada um).
export function createLimiters(limits = DEFAULT_LIMITS, { storeFor } = {}) {
  if (limits === false) {
    return Object.fromEntries(["general", "signup", "signin", "signinAccount", "google", "refresh", "challenge", "twoFactor", "email", "emailTarget"].map((k) => [k, passthrough]));
  }
  const l = { ...DEFAULT_LIMITS, ...limits };
  const store = (name) => storeFor?.(name);
  const emailKey = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? "").toLowerCase().slice(0, 254)}`;
  return {
    general: make(l.general, {}, store("general")),
    signup: make(l.signup, {}, store("signup")),
    signin: make(l.signin, {}, store("signin")),
    // Só erros contam, e a chave junta IP e email: errar a senha de alguém de outro
    // lugar não tranca a conta dessa pessoa.
    signinAccount: make(l.signinAccount, { skipSuccessfulRequests: true, keyGenerator: emailKey }, store("signinAccount")),
    google: make(l.google, {}, store("google")),
    refresh: make(l.refresh, {}, store("refresh")),
    challenge: make(l.challenge, {}, store("challenge")),
    // Segunda etapa e ativação/desativação do 2FA: só os erros contam.
    twoFactor: make(l.twoFactor, { skipSuccessfulRequests: true }, store("twoFactor")),
    email: make(l.email, {}, store("email")),
    // Pedidos de reenvio para o MESMO email, de qualquer IP: não dá para encher a caixa de alguém.
    emailTarget: make(l.emailTarget, { keyGenerator: (req) => `target|${String(req.body?.email ?? "").toLowerCase().slice(0, 254)}` }, store("emailTarget")),
  };
}
