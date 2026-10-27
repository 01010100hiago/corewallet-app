// Meses são contados no horário de Brasília (UTC-3, sem horário de verão desde 2019):
// um lançamento feito às 22h do dia 31 ainda é daquele mês, mesmo que em UTC já
// seja dia 1.
export const MONTH_TZ = "-03:00";
const OFFSET_MS = 3 * 60 * 60 * 1000;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isMonthKey = (value) => typeof value === "string" && MONTH_RE.test(value) && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100;

// "2026-10" -> { start, end } (end exclusivo), em instantes UTC.
export function monthRange(key) {
  if (!isMonthKey(key)) return null;
  const [y, m] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) + OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) + OFFSET_MS),
  };
}

// Mês (YYYY-MM) em que um instante cai, no horário de Brasília.
export function monthKeyOf(date) {
  const d = new Date(new Date(date).getTime() - OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthLabel = (key) => `${NAMES[Number(key.slice(5)) - 1]} de ${key.slice(0, 4)}`;
