import dayjs from "dayjs";

// "Hoje", "Ontem" ou a data, para agrupar a lista de lançamentos.
export function dayLabel(date, today = dayjs()) {
  const d = dayjs(date);
  if (d.isSame(today, "day")) return "Hoje";
  if (d.isSame(today.subtract(1, "day"), "day")) return "Ontem";
  return d.format("DD/MM/YYYY");
}
