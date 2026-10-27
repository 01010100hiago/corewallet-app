// Erros do banco que significam "agora não dá" (fora do ar, lento demais, sem conexão), e não bug nosso.
// A API responde 503 com pedido para tentar de novo, em vez de um 500 genérico.
const UNAVAILABLE_NAMES = new Set(["MongooseServerSelectionError", "MongoServerSelectionError", "MongoNetworkTimeoutError", "MongoNetworkError", "MongoWaitQueueTimeoutError", "MongoNotConnectedError", "MongoTopologyClosedError"]);
const MAX_TIME_MS_EXPIRED = 50;

export function isDbUnavailable(err) {
  if (!err) return false;
  if (UNAVAILABLE_NAMES.has(err.name)) return true;
  if (err.code === MAX_TIME_MS_EXPIRED) return true;
  // Mongoose segura as operações enquanto reconecta e desiste depois de um tempo.
  return err.name === "MongooseError" && /buffering timed out/i.test(err.message ?? "");
}
