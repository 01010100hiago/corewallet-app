import * as transactionService from "../services/transactionService.js";

const publicTransaction = (t) => ({
  id: String(t._id),
  type: t.type,
  value: t.valueCents,
  description: t.description,
  createdAt: t.createdAt,
});

export const transactionController = {
  async create(req, res) {
    const transaction = await transactionService.create(req.user.id, req.body);
    res.status(201).json(publicTransaction(transaction));
  },

  async list(req, res) {
    const { transactions, balance, truncated } = await transactionService.listByUser(req.user.id);
    res.json({ balance, truncated, transactions: transactions.map(publicTransaction) });
  },
};
