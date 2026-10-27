import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import healthRouter from "./routes/healthRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createTransactionRouter } from "./routes/transactionRoutes.js";
import { createAuthMiddleware } from "./middlewares/authMiddleware.js";

// Mensagem que pode ir para o cliente. Erros do parser de JSON trazem detalhes
// internos, então viram frases fixas; o resto só aparece se for marcado como público.
function publicMessage(err, status) {
  if (err.type === "entity.parse.failed") return "JSON inválido";
  if (err.type === "entity.too.large") return "Corpo da requisição grande demais";
  if (status < 500 && err.expose) return err.message;
  return "Erro interno";
}

export function createApp(env) {
  const app = express();
  const authMiddleware = createAuthMiddleware(env.jwtSecret);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  // Nada da API deve ficar em cache do navegador ou de proxy: tem dados da pessoa logada.
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.use("/api", healthRouter);
  app.use("/api/auth", createAuthRouter(env, authMiddleware));
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
