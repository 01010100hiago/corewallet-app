import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import healthRouter from "./routes/healthRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createTransactionRouter } from "./routes/transactionRoutes.js";
import { createCategoryRouter } from "./routes/categoryRoutes.js";
import { createAnalysisRouter } from "./routes/analysisRoutes.js";
import { createAuthMiddleware } from "./middlewares/authMiddleware.js";
import { createCaptcha, createPowCaptcha } from "./services/captchaService.js";
import { createCsrf } from "./middlewares/csrf.js";
import { createLimiters } from "./middlewares/rateLimit.js";
import { createGoogleVerifier } from "./services/googleService.js";
import { createMailer } from "./services/mailer.js";
import { createEmailVerification } from "./services/emailVerificationService.js";
import { createTwoFactor } from "./services/twoFactorService.js";
import { isDbUnavailable } from "./lib/dbErrors.js";
import { MongoRateLimitStore } from "./lib/mongoRateLimitStore.js";
import { createMongoClaimStore } from "./lib/claimStores.js";

// Mensagem que pode ir para o cliente. Erros do parser de JSON trazem detalhes
// internos, então viram frases fixas; o resto só aparece se for marcado como público.
function publicMessage(err, status) {
  if (err.type === "entity.parse.failed") return "JSON inválido";
  if (err.type === "entity.too.large") return "Corpo da requisição grande demais";
  if (status < 500 && err.expose) return err.message;
  return "Erro interno";
}

// deps permite trocar captcha e Google por versões de teste.
export function createApp(env, deps = {}) {
  const app = express();
  // Estado de curta duração (contadores de limite, desafios usados) fica no Mongo, para várias instâncias
  // da API dividirem o mesmo estado. `deps` troca por versões em memória nos testes sem banco.
  const powStore = deps.powStore ?? createMongoClaimStore();
  const captcha = deps.captcha ?? (env.turnstile ? createCaptcha(env.turnstile) : env.pow ? createPowCaptcha(env.pow, undefined, powStore) : createCaptcha(null));
  const google = deps.google ?? createGoogleVerifier(env.googleClientId);
  const mailer = deps.mailer ?? createMailer(env.mail);
  const emailVerification = deps.emailVerification ?? createEmailVerification({ mailer, webOrigin: env.webOrigin });
  const twoFactor = deps.twoFactor ?? createTwoFactor({ jwtSecret: env.jwtSecret, encryptionKey: env.totpEncryptionKey ?? env.jwtSecret });
  const authMiddleware = createAuthMiddleware(env.jwtSecret, env.cookieSecure);
  // env.rateLimits só existe nos testes (false desliga, objeto troca os limites).
  const limiters = createLimiters(env.rateLimits, { storeFor: deps.rateLimitStoreFor ?? ((name) => new MongoRateLimitStore({ prefix: `${name}|` })) });

  app.disable("x-powered-by");
  // Atrás do nginx, req.ip só é o IP da pessoa se a API confiar no cabeçalho dele.
  if (env.trustProxy) app.set("trust proxy", env.trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  // Nada da API deve ficar em cache do navegador ou de proxy: tem dados da pessoa logada.
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.use("/api", healthRouter);
  app.use("/api", limiters.general, createCsrf(env));
  app.use("/api/auth", createAuthRouter({ env, captcha, google, mailer, emailVerification, twoFactor }, authMiddleware, limiters));
  app.use("/api/transactions", createTransactionRouter(authMiddleware));
  app.use("/api/categories", createCategoryRouter(authMiddleware));
  app.use("/api/analysis", createAnalysisRouter(authMiddleware));

  app.use((req, res) => {
    res.status(404).json({ message: "Rota não encontrada" });
  });

  // Erro inesperado: registra no log e devolve mensagem genérica.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const unavailable = isDbUnavailable(err);
    const status = unavailable ? 503 : err.status || 500;
    if (status >= 500) console.error(err);
    const body = { message: unavailable ? "Serviço indisponível no momento. Tente de novo em instantes." : publicMessage(err, status) };
    if (unavailable) res.set("Retry-After", "3");
    // O detalhe por campo vai em qualquer erro do cliente (422 de validação, 409 de conflito), nunca em 5xx.
    if (status < 500 && err.errors) body.errors = err.errors;
    // Código curto para a tela reagir (ex.: email ainda não confirmado).
    if (status < 500 && err.publicCode) body.code = err.publicCode;
    res.status(status).json(body);
  });

  return app;
}
