import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import healthRouter from "./routes/healthRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createTransactionRouter } from "./routes/transactionRoutes.js";
import { createAuthMiddleware } from "./middlewares/authMiddleware.js";
import { createCaptcha } from "./services/captchaService.js";
import { createCsrf } from "./middlewares/csrf.js";
import { createLimiters } from "./middlewares/rateLimit.js";
import { createGoogleVerifier } from "./services/googleService.js";

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
  const captcha = deps.captcha ?? createCaptcha(env.turnstile);
  const google = deps.google ?? createGoogleVerifier(env.googleClientId);
  const authMiddleware = createAuthMiddleware(env.jwtSecret);
  // env.rateLimits só existe nos testes (false desliga, objeto troca os limites).
  const limiters = createLimiters(env.rateLimits);

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
  app.use("/api/auth", createAuthRouter({ env, captcha, google }, authMiddleware, limiters));
  app.use("/api/transactions", createTransactionRouter(authMiddleware));

  app.use((req, res) => {
    res.status(404).json({ message: "Rota não encontrada" });
  });

  // Erro inesperado: registra no log e devolve mensagem genérica.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ message: publicMessage(err, status) });
  });

  return app;
}
