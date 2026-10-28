import { categoryLabel } from "@corewallet/shared";
import { moneyText } from "./format.js";

export const ACTION_LABEL = { created: "Criado", edited: "Editado", deleted: "Excluído", restored: "Restaurado", archived: "Arquivado", unarchived: "Desarquivado" };

// Uma linha por campo que mudou: "Valor: R$ 120,50 → R$ 100,00".
export function describeChange(change, type, categories = [], hidden = false) {
  if (change.field === "value") return `Valor: ${moneyText(change.from, hidden)} → ${moneyText(change.to, hidden)}`;
  if (change.field === "category") return `Categoria: ${categoryLabel(type, change.from, categories)} → ${categoryLabel(type, change.to, categories)}`;
  return `Descrição: “${change.from}” → “${change.to}”`;
}

// Como o lançamento estava no momento do evento.
export const describeSnapshot = (snapshot, categories = [], hidden = false) =>
  `${moneyText(snapshot.value, hidden)} · ${categoryLabel(snapshot.type, snapshot.category, categories)}`;
