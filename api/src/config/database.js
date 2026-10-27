import mongoose from "mongoose";

// Limites para o banco lento ou fora do ar não deixar pedidos pendurados para sempre. O navegador
// desiste em 15 s (web/src/lib/api.js), então a API precisa falhar antes disso.
const SERVER_SELECTION_TIMEOUT_MS = 5_000; // achar um servidor do Mongo
const CONNECT_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 10_000; // uma resposta do Mongo
const QUERY_MAX_TIME_MS = 8_000; // o Mongo para a consulta sozinho, sem esperar o socket cair

export async function connectDb(uri) {
  mongoose.set("strictQuery", true);
  mongoose.set("maxTimeMS", QUERY_MAX_TIME_MS);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
  });
  console.log("MongoDB conectado");
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// Conectado de verdade: o Mongo responde a um ping em pouco tempo (conexão aberta mas travada não conta).
export async function pingDb(timeoutMs = 2_000) {
  if (!isDbConnected()) return false;
  let timer;
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("ping demorou demais")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
