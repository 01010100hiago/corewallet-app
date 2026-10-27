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

const publicEvent = (e) => ({
  id: String(e._id),
  transactionId: String(e.transactionId),
  action: e.action,
  at: e.at,
  snapshot: { type: e.snapshot.type, value: e.snapshot.valueCents, description: e.snapshot.description, category: e.snapshot.category },
  changes: (e.changes ?? []).map((c) => ({ field: c.field, from: c.from, to: c.to })),
});

const notFound = (res) => res.status(404).json({ message: "Lançamento não encontrado" });

export const transactionController = {
  async create(req, res) {
    const transaction = await transactionService.create(req.user.id, req.body);
    res.status(201).json(publicTransaction(transaction));
  },

  async list(req, res) {
    const { transactions, month, ...rest } = await transactionService.listByUser(req.user.id, { month: req.validatedQuery.month });
    res.json({ ...rest, month, transactions: transactions.map(publicTransaction) });
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

  async archive(req, res) {
    const transaction = await transactionService.archive(req.user.id, req.params.id);
    if (!transaction) return notFound(res);
    res.json(publicTransaction(transaction));
  },

  async unarchive(req, res) {
    const transaction = await transactionService.unarchive(req.user.id, req.params.id);
    if (!transaction) return notFound(res);
    res.json(publicTransaction(transaction));
  },

  async restore(req, res) {
    const transaction = await transactionService.restore(req.user.id, req.params.id);
    if (!transaction) return notFound(res);
    res.json(publicTransaction(transaction));
  },

  async history(req, res) {
    const history = await transactionService.historyOf(req.user.id, req.params.id);
    if (!history) return notFound(res);
    res.json({ deleted: history.deleted, events: history.events.map(publicEvent) });
  },

  async activity(req, res) {
    const { events, truncated, deleted, deletedTruncated, archived, archivedTruncated } = await transactionService.activity(req.user.id);
    res.json({
      events: events.map(publicEvent),
      truncated,
      deletedTruncated,
      archivedTruncated,
      deleted: deleted.map((t) => ({ ...publicTransaction(t), deletedAt: t.deletedAt })),
      archived: archived.map((t) => ({ ...publicTransaction(t), archivedAt: t.archivedAt })),
    });
  },
};
