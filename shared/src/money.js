// Valores são guardados em centavos (inteiro) para não ter erro de arredondamento.

// Aceita "12,50", "12.50" ou "1.234,56" e devolve o valor em centavos, ou null se inválido.
export function parseToCents(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    const cents = Math.round(input * 100);
    // Mais de 2 casas decimais (19.999) é recusado em vez de arredondado.
    return Math.abs(input * 100 - cents) < 1e-6 ? cents : null;
  }
  if (typeof input !== "string") return null;

  let text = input.trim().replace(/\s/g, "");
  if (!text) return null;

  if (text.includes(",")) {
    // formato brasileiro: ponto separa milhar (de 3 em 3), vírgula separa os centavos
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(text)) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const [reais, centavos = ""] = text.split(".");
  return Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents) {
  return brl.format(cents / 100);
}
