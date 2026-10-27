import mongoose from "mongoose";
import { CATEGORIES, DEFAULT_CATEGORY, MAX_CUSTOM_CATEGORIES_PER_TYPE, isCategoryOf, isCustomCategoryId } from "@corewallet/shared";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import TransactionEvent from "../models/TransactionEvent.js";
import User from "../models/User.js";

const keyOf = (name) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export class CategoryError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.expose = true;
  }
}

export const listByUser = async (userId) =>
  (await Category.find({ userId }).sort({ nameKey: 1 }).lean()).map((c) => ({ id: String(c._id), type: c.type, name: c.name }));

// Cria a categoria. Se a pessoa já tem uma com esse nome (ou o nome é de uma categoria de
// fábrica do mesmo tipo), devolve a que já existe em vez de duplicar.
export async function create(userId, { type, name }) {
  const key = keyOf(name);
  const builtIn = CATEGORIES[type].find((c) => keyOf(c.label) === key || c.id === key);
  if (builtIn) return { id: builtIn.id, type, name: builtIn.label, created: false };

  const existing = await Category.findOne({ userId, type, nameKey: key }).lean();
  if (existing) return { id: String(existing._id), type, name: existing.name, created: false };

  // Reserva uma vaga antes de criar. O contador do usuário só sobe se ainda houver vaga (uma única
  // operação atômica), então criações ao mesmo tempo nunca passam do limite. O $max alinha o
  // contador ao que existe de verdade (primeira vez, ou categorias gravadas por fora).
  const field = `categoryCount.${type}`;
  await User.updateOne({ _id: userId }, { $max: { [field]: await Category.countDocuments({ userId, type }) } });
  const reserved = await User.findOneAndUpdate({ _id: userId, [field]: { $lt: MAX_CUSTOM_CATEGORIES_PER_TYPE } }, { $inc: { [field]: 1 } });
  if (!reserved) {
    throw new CategoryError("Dados inválidos", 422, { name: `Você já tem ${MAX_CUSTOM_CATEGORIES_PER_TYPE} categorias deste tipo` });
  }
  try {
    const doc = await Category.create({ userId, type, name, nameKey: key });
    return { id: String(doc._id), type, name: doc.name, created: true };
  } catch (err) {
    await User.updateOne({ _id: userId }, { $inc: { [field]: -1 } });
    if (err?.code === 11000) {
      // Duas requisições com o mesmo nome ao mesmo tempo: a outra criou primeiro.
      const again = await Category.findOne({ userId, type, nameKey: key }).lean();
      if (again) return { id: String(again._id), type, name: again.name, created: false };
    }
    throw err;
  }
}

// A categoria de um lançamento precisa existir e ser do tipo dele: de fábrica, ou da própria pessoa.
export async function isUsable(userId, type, category) {
  if (isCategoryOf(type, category)) return true;
  if (!isCustomCategoryId(category) || !mongoose.isValidObjectId(category)) return false;
  return Boolean(await Category.exists({ _id: category, userId, type }));
}

// Quantos lançamentos (ativos e arquivados; os excluídos não contam) usam cada categoria, de
// fábrica ou criada pela pessoa.
export async function usageByUser(userId) {
  const rows = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), deletedAt: null } },
    { $group: { _id: { type: "$type", category: { $ifNull: ["$category", DEFAULT_CATEGORY] } }, count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ type: r._id.type, category: r._id.category, count: r.count }));
}

const ownedOrNull = (userId, id) => (mongoose.isValidObjectId(id) ? Category.findOne({ _id: id, userId }) : null);

// Outro nome de categoria que já existe para este tipo: de fábrica ou da pessoa (menos a própria).
async function nameTaken(userId, type, key, exceptId) {
  const builtIn = CATEGORIES[type].find((c) => keyOf(c.label) === key || c.id === key);
  if (builtIn) return "Já existe uma categoria padrão com esse nome.";
  const other = await Category.findOne({ userId, type, nameKey: key, _id: { $ne: exceptId } }).lean();
  return other ? "Você já tem uma categoria com esse nome." : null;
}

// Renomeia uma categoria da pessoa. Os lançamentos guardam o id, então todos passam a mostrar o nome novo.
export async function rename(userId, id, name) {
  const category = await ownedOrNull(userId, id);
  if (!category) return null;
  const key = keyOf(name);
  const taken = await nameTaken(userId, category.type, key, category._id);
  if (taken) throw new CategoryError("Dados inválidos", 409, { name: taken });
  try {
    category.name = name;
    category.nameKey = key;
    await category.save();
  } catch (err) {
    // Dois pedidos ao mesmo tempo com o mesmo nome: o índice único decide.
    if (err?.code === 11000) throw new CategoryError("Dados inválidos", 409, { name: "Você já tem uma categoria com esse nome." });
    throw err;
  }
  return { id: String(category._id), type: category.type, name: category.name };
}

// Move todos os lançamentos de `from` para `to` (de todo status) e registra a mudança de cada um
// no histórico. Devolve quantos moveu.
async function moveTransactions(userId, from, to) {
  const affected = await Transaction.find({ userId, category: from }).lean();
  if (affected.length === 0) return 0;
  await Transaction.updateMany({ userId, category: from }, { $set: { category: to } });
  const at = new Date();
  await TransactionEvent.insertMany(
    affected.map((t) => ({
      userId,
      transactionId: t._id,
      action: "edited",
      at,
      snapshot: { type: t.type, valueCents: t.valueCents, description: t.description, category: to },
      changes: [{ field: "category", from, to }],
    }))
  );
  return affected.length;
}

// Apaga uma categoria da pessoa. Se ela tem lançamentos, é preciso dizer para onde movê-los
// (`moveTo`: categoria padrão ou da própria pessoa, do mesmo tipo). Nunca deixa lançamento sem categoria.
export async function remove(userId, id, moveTo) {
  const category = await ownedOrNull(userId, id);
  if (!category) return null;
  const from = String(category._id);

  const inUse = await Transaction.countDocuments({ userId, category: from });
  if (inUse > 0 && !moveTo) {
    throw new CategoryError(`Esta categoria tem ${inUse} ${inUse === 1 ? "lançamento" : "lançamentos"}. Escolha para onde movê-${inUse === 1 ? "lo" : "los"}.`, 409, { moveTo: "Escolha a categoria de destino" });
  }
  if (moveTo !== undefined && (moveTo === from || !(await isUsable(userId, category.type, moveTo)))) {
    throw new CategoryError("Dados inválidos", 422, { moveTo: "Categoria de destino inválida" });
  }

  const destination = moveTo ?? DEFAULT_CATEGORY;
  let moved = await moveTransactions(userId, from, destination);
  await Category.deleteOne({ _id: category._id });
  await User.updateOne({ _id: userId, [`categoryCount.${category.type}`]: { $gt: 0 } }, { $inc: { [`categoryCount.${category.type}`]: -1 } });
  // Quem criou um lançamento com esta categoria no meio do caminho também vai para o destino.
  moved += await moveTransactions(userId, from, destination);
  return { moved };
}
