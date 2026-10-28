import mongoose from "mongoose";
import { DEFAULT_CATEGORY, MONTH_TZ, monthKeyOf, monthRange, shiftMonth } from "@corewallet/shared";
import Transaction from "../models/Transaction.js";

export const TOP_EXPENSES = 5;

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const sumOf = (rows, type) => rows.filter((r) => r._id.type === type).reduce((n, r) => n + r.total, 0);

// Análise dos últimos `months` meses (contando o atual, que ainda está em andamento), sempre no
// horário de Brasília. Arquivados contam (continuam valendo); excluídos não.
// O período anterior tem o mesmo tamanho e termina onde este começa, para comparar.
export async function analyze(userId, { months }, now = new Date()) {
  const currentKey = monthKeyOf(now);
  const firstKey = shiftMonth(currentKey, -(months - 1));
  const start = monthRange(firstKey).start;
  const end = monthRange(currentKey).end;
  const previousStart = monthRange(shiftMonth(firstKey, -months)).start;
  const owner = { userId: oid(userId), deletedAt: null };

  const [byMonth, before, byCategory, previousByCategory, top] = await Promise.all([
    Transaction.aggregate([
      { $match: { ...owner, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { month: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: MONTH_TZ } }, type: "$type" }, total: { $sum: "$valueCents" } } },
    ]),
    Transaction.aggregate([{ $match: { ...owner, createdAt: { $lt: start } } }, { $group: { _id: { type: "$type" }, total: { $sum: "$valueCents" } } }]),
    categoryTotals(owner, start, end),
    categoryTotals(owner, previousStart, start),
    Transaction.find({ ...owner, type: "output", createdAt: { $gte: start, $lt: end } })
      .sort({ valueCents: -1, createdAt: -1, _id: -1 })
      .limit(TOP_EXPENSES)
      .lean(),
  ]);

  // Todos os meses do período aparecem, com zero onde não houve lançamento.
  const series = Array.from({ length: months }, (_, i) => {
    const key = shiftMonth(firstKey, i);
    const get = (type) => byMonth.find((r) => r._id.month === key && r._id.type === type)?.total ?? 0;
    return { key, totalIn: get("input"), totalOut: get("output") };
  });

  const previous = new Map(previousByCategory.map((r) => [`${r._id.type}:${r._id.category}`, r.total]));
  const categories = byCategory
    .map((r) => ({ type: r._id.type, category: r._id.category, total: r.total, previousTotal: previous.get(`${r._id.type}:${r._id.category}`) ?? 0 }))
    .sort((a, b) => b.total - a.total);

  return {
    months: series,
    openingBalance: sumOf(before, "input") - sumOf(before, "output"),
    previous: { totalIn: sumOf(previousByCategory, "input"), totalOut: sumOf(previousByCategory, "output") },
    categories,
    topExpenses: top,
  };
}

const categoryTotals = (owner, from, to) =>
  Transaction.aggregate([
    { $match: { ...owner, createdAt: { $gte: from, $lt: to } } },
    { $group: { _id: { type: "$type", category: { $ifNull: ["$category", DEFAULT_CATEGORY] } }, total: { $sum: "$valueCents" } } },
  ]);
