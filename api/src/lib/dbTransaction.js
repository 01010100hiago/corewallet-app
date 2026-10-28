import mongoose from "mongoose";

// Transações do Mongo ("tudo ou nada") só existem em réplica (ou cluster). O docker-compose do projeto
// sobe o Mongo como réplica de um nó. Em um Mongo solto (standalone) as gravações em mais de um passo
// continuam funcionando, mas sem a garantia: o aviso na conexão deixa isso claro.
let supported = false;

export async function detectTransactions() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  supported = Boolean(hello.setName) || hello.msg === "isdbgrid";
  return supported;
}

export const transactionsSupported = () => supported;

// Roda `work(session)` numa transação: se algo falhar no meio, nenhuma gravação fica. O Mongo repete a
// função sozinho em conflitos passageiros (por isso ela não pode ter efeito fora do banco). Sem réplica,
// roda sem sessão (`session` é undefined e as chamadas do Mongoose a ignoram).
export async function inTransaction(work) {
  if (!supported) return work(undefined);
  const session = await mongoose.startSession();
  try {
    let result;
    // maxCommitTimeMS e o teto de repetições mantêm o pedido abaixo do tempo limite do navegador.
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      { maxCommitTimeMS: 5000 }
    );
    return result;
  } finally {
    await session.endSession();
  }
}
