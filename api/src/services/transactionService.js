import mongoose from "mongoose";
import { DEFAULT_CATEGORY, isCategoryOf, monthRange } from "@corewallet/shared";
import Transaction from "../models/Transaction.js";

export const LIST_LIMIT = 500;

export class TransactionError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.expose = true;
  }
}

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const categoryOrDefault = { $ifNull: ["$category", DEFAULT_CATEGORY] };

export function create(userId, { type, value, description, category }) {
  return Transaction.create({ userId, type, valueCents: value, description, category });
}

// Só devolve o lançamento se ele for do usuário: id de outra pessoa é igual a "não existe".
export async function findOwned(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Transaction.findOne({ _id: id, userId });
}

// Edita valor, descrição e categoria. O tipo e a data não mudam: para trocar o tipo,
// exclua e crie de novo; a data é sempre a do servidor.
export async function update(userId, id, { value, description, category }) {
  const current = await findOwned(userId, id);
  if (!current) return null;
  if (!isCategoryOf(current.type, category)) {
    throw new TransactionError("Dados inválidos", 422, { category: "Categoria não combina com o tipo do lançamento" });
  }
  return Transaction.findOneAndUpdate(
    { _id: current._id, userId },
    { $set: { valueCents: value, description, category } },
    { returnDocument: "after", runValidators: true }
  );
}

export async function remove(userId, id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const res = await Transaction.deleteOne({ _id: id, userId });
  return res.deletedCount === 1;
}

// Totais de TODOS os lançamentos do usuário, calculados no banco (a lista é cortada
// em LIST_LIMIT, então o front não pode somar só o que recebe).
async function totalsOf(userId, range) {
  const match = { userId: oid(userId) };
  if (range) match.createdAt = { $gte: range.start, $lt: range.end };
  const rows = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: { type: "$type", category: categoryOrDefault }, total: { $sum: "$valueCents" }, count: { $sum: 1 } } },
  ]);
  const sum = (type) => rows.filter((r) => r._id.type === type).reduce((n, r) => n + r.total, 0);
  const totalIn = sum("input");
  const totalOut = sum("output");
  return {
    totalIn,
    totalOut,
    count: rows.reduce((n, r) => n + r.count, 0),
    categories: rows.map((r) => ({ type: r._id.type, category: r._id.category, total: r.total })).sort((a, b) => b.total - a.total),
  };
}

// Sempre filtra pelo dono: um usuário nunca enxerga lançamento de outro.
// Com `month` ("2026-10") a lista e o resumo cobrem só aquele mês; o saldo é sempre o geral.
export async function listByUser(userId, { month, limit = LIST_LIMIT } = {}) {
  const range = month ? monthRange(month) : null;
  const filter = { userId };
  if (range) filter.createdAt = { $gte: range.start, $lt: range.end };

  const [transactions, all, inMonth] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    totalsOf(userId),
    range ? totalsOf(userId, range) : null,
  ]);
  const scope = inMonth ?? all;
  return {
    transactions,
    balance: all.totalIn - all.totalOut,
    totalIn: all.totalIn,
    totalOut: all.totalOut,
    truncated: scope.count > transactions.length,
    month: inMonth && { key: month, totalIn: inMonth.totalIn, totalOut: inMonth.totalOut, count: inMonth.count, categories: inMonth.categories },
  };
}
