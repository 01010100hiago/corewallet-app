import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/database.js";

const env = loadEnv();
const app = createApp(env);

await connectDb(env.databaseUri);

const server = app.listen(env.port, () => {
  console.log(`API ouvindo na porta ${env.port}`);
});
// Quem demora demais para mandar o pedido (conexão lenta de propósito) é derrubado. Os pedidos
// da API são pequenos (corpo de até 10 kB), então 20 s para os cabeçalhos e 30 s no total é folga.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;

// Ao parar (deploy, reinício): para de aceitar pedidos, deixa os que estão em andamento terminarem e só
// então fecha o banco. Se algum não terminar em 10 s, sai assim mesmo.
const SHUTDOWN_GRACE_MS = 10_000;
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
