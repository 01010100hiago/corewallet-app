import { DEFAULT_CATEGORY } from "@corewallet/shared";
import * as transactionService from "../services/transactionService.js";

const publicTransaction = (t) => ({
  id: String(t._id),
  type: t.type,
  value: t.valueCents,
  description: t.description,
  category: t.category ?? DEFAULT_CATEGORY,
  createdAt: t.createdAt,
});

const notFound = (res) => res.status(404).json({ message: "Lançamento não encontrado" });

export const transactionController = {
  async create(req, res) {
    const transaction = await transactionService.create(req.user.id, req.body);
    res.status(201).json(publicTransaction(transaction));
  },

  async list(req, res) {
    const { transactions, month, ...totals } = await transactionService.listByUser(req.user.id, { month: req.validatedQuery.month });
    res.json({ ...totals, month, transactions: transactions.map(publicTransaction) });
  },

  async get(req, res) {
    const transaction = await transactionService.findOwned(req.user.id, req.params.id);
    if (!transaction) return notFound(res);
    res.json(publicTransaction(transaction));
  },

  async update(req, res) {
    const transaction = await transactionService.update(req.user.id, req.params.id, req.body);
    if (!transaction) return notFound(res);
    res.json(publicTransaction(transaction));
  },

  async remove(req, res) {
    if (!(await transactionService.remove(req.user.id, req.params.id))) return notFound(res);
    res.status(204).end();
  },
};
