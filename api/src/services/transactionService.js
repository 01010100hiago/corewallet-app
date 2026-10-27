import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";

export const LIST_LIMIT = 500;

export function create(userId, { type, value, description }) {
  return Transaction.create({ userId, type, valueCents: value, description });
}

// Saldo de TODOS os lançamentos do usuário, calculado no banco (a lista abaixo
// é cortada em LIST_LIMIT, então o front não pode somar só o que recebe).
async function balanceOf(userId) {
  const rows = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: "$type", total: { $sum: "$valueCents" }, count: { $sum: 1 } } },
  ]);
  const sum = (type) => rows.find((r) => r._id === type)?.total ?? 0;
  const count = rows.reduce((n, r) => n + r.count, 0);
  const totalIn = sum("input");
  const totalOut = sum("output");
  return { balance: totalIn - totalOut, totalIn, totalOut, count };
}

// Sempre filtra pelo dono: um usuário nunca enxerga lançamento de outro.
export async function listByUser(userId, limit = LIST_LIMIT) {
  const [transactions, { balance, totalIn, totalOut, count }] = await Promise.all([
    Transaction.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    balanceOf(userId),
  ]);
  return { transactions, balance, totalIn, totalOut, truncated: count > transactions.length };
}
