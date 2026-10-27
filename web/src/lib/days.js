import { inBrasilia } from "./brasilia.js";

// "Hoje", "Ontem" ou a data, para agrupar a lista de lançamentos (horário de Brasília).
export function dayLabel(date, today = new Date()) {
  const d = inBrasilia(date);
  const now = inBrasilia(today);
  if (d.isSame(now, "day")) return "Hoje";
  if (d.isSame(now.subtract(1, "day"), "day")) return "Ontem";
  return d.format("DD/MM/YYYY");
}
