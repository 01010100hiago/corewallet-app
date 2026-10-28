// Erros do banco que significam "agora não dá" (fora do ar, lento demais, sem conexão), e não bug nosso.
// A API responde 503 com pedido para tentar de novo, em vez de um 500 genérico.
const UNAVAILABLE_NAMES = new Set(["MongooseServerSelectionError", "MongoServerSelectionError", "MongoNetworkTimeoutError", "MongoNetworkError", "MongoWaitQueueTimeoutError", "MongoNotConnectedError", "MongoTopologyClosedError"]);
const MAX_TIME_MS_EXPIRED = 50;
// Eleição/reinício do Mongo no meio de uma transação: NotWritablePrimary, PrimarySteppedDown, InterruptedAtShutdown, NoSuchTransaction...
const UNAVAILABLE_CODES = new Set([10107, 189, 91, 251, 11600]);

export function isDbUnavailable(err) {
  if (!err) return false;
  if (UNAVAILABLE_NAMES.has(err.name)) return true;
  if (err.code === MAX_TIME_MS_EXPIRED || UNAVAILABLE_CODES.has(err.code)) return true;
  if (typeof err.hasErrorLabel === "function" && (err.hasErrorLabel("TransientTransactionError") || err.hasErrorLabel("UnknownTransactionCommitResult"))) return true;
  // Mongoose segura as operações enquanto reconecta e desiste depois de um tempo.
  return err.name === "MongooseError" && /buffering timed out/i.test(err.message ?? "");
}
