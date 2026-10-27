import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/database.js";

const env = loadEnv();
const app = createApp(env);

await connectDb(env.databaseUri);

const server = app.listen(env.port, () => {
  console.log(`API ouvindo na porta ${env.port}`);
});

async function shutdown() {
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
