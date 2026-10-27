import mongoose from "mongoose";
import { CATEGORIES, MAX_CUSTOM_CATEGORIES_PER_TYPE, isCategoryOf, isCustomCategoryId } from "@corewallet/shared";
import Category from "../models/Category.js";
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
