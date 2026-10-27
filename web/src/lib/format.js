import { formatCents } from "@corewallet/shared";

const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
// "R$ 1,2 mil", para os eixos dos gráficos (valor em centavos).
export const formatCompact = (cents) => compact.format(cents / 100);

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// "2026-10" -> "out"; com o ano quando é janeiro ou o primeiro mês da série ("jan/27").
export const monthShort = (key) => SHORT[Number(key.slice(5)) - 1];
export const monthShortWithYear = (key) => `${monthShort(key)}/${key.slice(2, 4)}`;

// Variação percentual de `current` sobre `previous`; null quando não há base de comparação.
// O denominador é o valor ABSOLUTO do anterior: de −200 para +100 houve melhora (+150%), e dividir
// pelo número com sinal inverteria o resultado.
export function variation(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// "+12,5%" / "−8,0%" (sinal de menos de verdade, não hífen).
export function formatVariation(value) {
  if (value === null || !Number.isFinite(value)) return "sem base de comparação";
  const abs = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (Math.abs(value) < 0.05) return "estável (0,0%)";
  return `${value > 0 ? "+" : "−"}${abs}%`;
}

export const formatPercent = (value) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Teto "redondo" para o eixo vertical: 1, 2, 2,5, 5 ou 10 vezes uma potência de 10.
export function niceMax(value) {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

export const MASKED_MONEY = "R$ ••••";

// Mesmos textos, mas com o modo "esconder valores" aplicado (para quando o valor entra em uma frase).
export const moneyText = (cents, hidden) => (hidden ? MASKED_MONEY : formatCents(cents));
export const compactText = (cents, hidden) => (hidden ? "•••" : formatCompact(cents));

export { formatCents };
