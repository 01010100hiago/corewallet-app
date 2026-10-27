import mongoose from "mongoose";
import { DEFAULT_CATEGORY, monthRange } from "@corewallet/shared";
import Transaction from "../models/Transaction.js";
import TransactionEvent from "../models/TransactionEvent.js";
import * as categoryService from "./categoryService.js";

export const LIST_LIMIT = 500;
export const ACTIVITY_LIMIT = 100;
export const DELETED_LIMIT = 200;
export const ARCHIVED_LIMIT = 200;

export class TransactionError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.expose = true;
  }
}

const archivedError = () => new TransactionError("Desarquive o lançamento antes de editar ou excluir.", 409);

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const categoryOrDefault = { $ifNull: ["$category", DEFAULT_CATEGORY] };
// Lançamento excluído (deletedAt preenchido) fica fora de tudo, menos do histórico.
const alive = { deletedAt: null };

const snapshotOf = (t) => ({ type: t.type, valueCents: t.valueCents, description: t.description, category: t.category ?? DEFAULT_CATEGORY });
const record = (t, action, at = new Date(), changes = undefined) =>
  TransactionEvent.create({ userId: t.userId, transactionId: t._id, action, at, snapshot: snapshotOf(t), changes });

async function assertCategory(userId, type, category) {
  if (!(await categoryService.isUsable(userId, type, category))) {
    throw new TransactionError("Dados inválidos", 422, { category: "Categoria não combina com o tipo do lançamento" });
  }
}

export async function create(userId, { type, value, description, category }) {
  await assertCategory(userId, type, category);
  const transaction = await Transaction.create({ userId, type, valueCents: value, description, category });
  await record(transaction, "created", transaction.createdAt);
  return transaction;
}

// Só devolve o lançamento se ele for do usuário: id de outra pessoa é igual a "não existe".
// Excluído também some, a não ser com { includeDeleted: true } (histórico).
export async function findOwned(userId, id, { includeDeleted = false } = {}) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Transaction.findOne({ _id: id, userId, ...(includeDeleted ? {} : alive) });
}

const FIELDS = [
  ["value", "valueCents"],
  ["description", "description"],
  ["category", "category"],
];

// Edita valor, descrição e categoria. O tipo e a data não mudam: para trocar o tipo,
// exclua e crie de novo; a data é sempre a do servidor. Cada edição que muda algo
// grava no histórico o que era e o que passou a ser.
//
// A gravação só acontece se o lançamento ainda estiver como foi lido (o filtro repete os
// valores lidos). Se outra edição chegou antes, lê de novo e refaz a conta, então o "de → para"
// do histórico sempre encadeia com o evento anterior.
export async function update(userId, id, { value, description, category }) {
  const next = { valueCents: value, description, category };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await findOwned(userId, id);
    if (!current) return null;
    if (current.archivedAt) throw archivedError();
    await assertCategory(userId, current.type, category);

    const changes = FIELDS.filter(([, key]) => (current[key] ?? (key === "category" ? DEFAULT_CATEGORY : undefined)) !== next[key]).map(([field, key]) => ({
      field,
      from: current[key] ?? DEFAULT_CATEGORY,
      to: next[key],
    }));
    if (changes.length === 0) return current;

    const updated = await Transaction.findOneAndUpdate(
      // category: null também casa com lançamento antigo, que não tem o campo.
      { _id: current._id, userId, ...alive, archivedAt: null, valueCents: current.valueCents, description: current.description, category: current.category ?? null },
      { $set: next },
      { returnDocument: "after", runValidators: true }
    );
    if (updated) {
      await record(updated, "edited", new Date(), changes);
      return updated;
    }
  }
  throw new TransactionError("Este lançamento mudou enquanto você editava. Tente de novo.", 409);
}

// Excluir = marcar como excluído. Sai da lista e dos totais; o histórico guarda o lançamento
// como estava e dá para restaurar.
export async function remove(userId, id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const at = new Date();
  const deleted = await Transaction.findOneAndUpdate({ _id: id, userId, ...alive, archivedAt: null }, { $set: { deletedAt: at } }, { returnDocument: "after" });
  if (deleted) {
    await record(deleted, "deleted", at);
    return true;
  }
  // Não achou: ou não existe, ou está arquivado (e então a resposta é outra).
  if (await Transaction.exists({ _id: id, userId, ...alive, archivedAt: { $ne: null } })) throw archivedError();
  return false;
}

// Arquivar = sair da lista, continuando a valer no saldo. Não arquiva o que já está arquivado
// nem o que foi excluído (404), então um duplo clique não gera dois eventos.
export async function archive(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const at = new Date();
  const archived = await Transaction.findOneAndUpdate({ _id: id, userId, ...alive, archivedAt: null }, { $set: { archivedAt: at } }, { returnDocument: "after" });
  if (archived) await record(archived, "archived", at);
  return archived;
}

export async function unarchive(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const restored = await Transaction.findOneAndUpdate({ _id: id, userId, ...alive, archivedAt: { $ne: null } }, { $set: { archivedAt: null } }, { returnDocument: "after" });
  if (restored) await record(restored, "unarchived");
  return restored;
}

export async function restore(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const restored = await Transaction.findOneAndUpdate({ _id: id, userId, deletedAt: { $ne: null } }, { $set: { deletedAt: null } }, { returnDocument: "after" });
  if (restored) await record(restored, "restored");
  return restored;
}

// Eventos de um lançamento (do mais novo para o mais antigo); null se não for do usuário.
export async function historyOf(userId, id) {
  const transaction = await findOwned(userId, id, { includeDeleted: true });
  if (!transaction) return null;
  const events = await TransactionEvent.find({ userId, transactionId: transaction._id }).sort({ at: -1, _id: -1 }).lean();
  return { deleted: Boolean(transaction.deletedAt), events };
}

// Registro geral de alterações do usuário: os eventos mais recentes (até `limit`, com aviso se
// houve corte) e, à parte e sem depender dessa janela, TODOS os lançamentos que continuam
// excluídos e arquivados, para sempre dar para restaurá-los e desarquivá-los.
export async function activity(userId, limit = ACTIVITY_LIMIT) {
  const rows = await TransactionEvent.find({ userId }).sort({ at: -1, _id: -1 }).limit(limit + 1).lean();
  // Um a mais que o limite, só para saber se houve corte (e avisar), sem devolver o excedente.
  const deletedRows = await Transaction.find({ userId, deletedAt: { $ne: null } }).sort({ deletedAt: -1, _id: -1 }).limit(DELETED_LIMIT + 1).lean();
  const archivedRows = await Transaction.find({ userId, ...alive, archivedAt: { $ne: null } }).sort({ archivedAt: -1, _id: -1 }).limit(ARCHIVED_LIMIT + 1).lean();
  return {
    events: rows.slice(0, limit),
    truncated: rows.length > limit,
    deleted: deletedRows.slice(0, DELETED_LIMIT),
    deletedTruncated: deletedRows.length > DELETED_LIMIT,
    archived: archivedRows.slice(0, ARCHIVED_LIMIT),
    archivedTruncated: archivedRows.length > ARCHIVED_LIMIT,
  };
}

// Totais dos lançamentos ATIVOS do usuário, calculados no banco (a lista é cortada
// em LIST_LIMIT, então o front não pode somar só o que recebe).
async function totalsOf(userId, range) {
  const match = { userId: oid(userId), ...alive };
  if (range) match.createdAt = { $gte: range.start, $lt: range.end };
  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { type: "$type", category: categoryOrDefault },
        total: { $sum: "$valueCents" },
        count: { $sum: 1 },
        // $gt: data > null é verdade; campo ausente ou nulo não é (lançamento sem arquivamento).
        archived: { $sum: { $cond: [{ $gt: ["$archivedAt", null] }, 1, 0] } },
      },
    },
  ]);
  const sum = (type) => rows.filter((r) => r._id.type === type).reduce((n, r) => n + r.total, 0);
  const totalIn = sum("input");
  const totalOut = sum("output");
  return {
    totalIn,
    totalOut,
    count: rows.reduce((n, r) => n + r.count, 0),
    archivedCount: rows.reduce((n, r) => n + r.archived, 0),
    categories: rows.map((r) => ({ type: r._id.type, category: r._id.category, total: r.total })).sort((a, b) => b.total - a.total),
  };
}

// Sempre filtra pelo dono: um usuário nunca enxerga lançamento de outro.
// Com `month` ("2026-10") a lista e o resumo cobrem só aquele mês; o saldo é sempre o geral.
export async function listByUser(userId, { month, limit = LIST_LIMIT } = {}) {
  const range = month ? monthRange(month) : null;
  // Arquivados ficam fora da lista, mas dentro dos totais (totalsOf não filtra arquivados).
  const filter = { userId, ...alive, archivedAt: null };
  if (range) filter.createdAt = { $gte: range.start, $lt: range.end };

  const [transactions, all, inMonth, categories] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    totalsOf(userId),
    range ? totalsOf(userId, range) : null,
    categoryService.listByUser(userId),
  ]);
  const scope = inMonth ?? all;
  return {
    transactions,
    categories,
    balance: all.totalIn - all.totalOut,
    totalIn: all.totalIn,
    totalOut: all.totalOut,
    truncated: scope.count - scope.archivedCount > transactions.length,
    month: inMonth && {
      key: month,
      totalIn: inMonth.totalIn,
      totalOut: inMonth.totalOut,
      // count: só o que aparece na lista; archivedCount: arquivados do mês, que contam nos totais.
      count: inMonth.count - inMonth.archivedCount,
      archivedCount: inMonth.archivedCount,
      categories: inMonth.categories,
    },
  };
}
