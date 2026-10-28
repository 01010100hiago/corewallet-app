import mongoose from "mongoose";
import { detectTransactions } from "../lib/dbTransaction.js";

// Limites para o banco lento ou fora do ar não deixar pedidos pendurados para sempre. O navegador
// desiste em 15 s (web/src/lib/api.js), então a API precisa falhar antes disso.
const SERVER_SELECTION_TIMEOUT_MS = 5_000; // achar um servidor do Mongo
const CONNECT_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 10_000; // uma resposta do Mongo
const QUERY_MAX_TIME_MS = 8_000; // o Mongo para a consulta sozinho, sem esperar o socket cair
// Sem conexão, o Mongoose segura as operações esperando reconectar. 10 s (o padrão) é mais que o tempo que o
// navegador espera, e cada pedido da API (inclusive o limite de tentativas) passa pelo banco.
const BUFFER_TIMEOUT_MS = 2_000;

export async function connectDb(uri) {
  mongoose.set("strictQuery", true);
  mongoose.set("maxTimeMS", QUERY_MAX_TIME_MS);
  mongoose.set("bufferTimeoutMS", BUFFER_TIMEOUT_MS);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
  });
  console.log("MongoDB conectado");
  // Logo depois de subir o Mongo a réplica pode ainda não ter sido criada: tenta por alguns segundos.
  let supported = await detectTransactions();
  for (let i = 0; !supported && i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    supported = await detectTransactions();
  }
  if (!supported) {
    const message = "o Mongo não é uma réplica, então as gravações em mais de um passo (histórico, apagar categoria) não são atômicas. Use o docker-compose do projeto (réplica de um nó).";
    // Em produção seguir sem a garantia seria falhar em silêncio.
    if (process.env.NODE_ENV === "production") throw new Error(`Mongo sem transações: ${message}`);
    console.warn(`Aviso: ${message}`);
  }
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
