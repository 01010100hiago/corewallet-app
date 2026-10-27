// Categorias fixas: cada lançamento tem uma, e ela precisa combinar com o tipo.
// "outros" existe nos dois tipos e é o padrão (também dos lançamentos antigos).
export const CATEGORIES = {
  input: [
    { id: "salario", label: "Salário" },
    { id: "freelance", label: "Freelance" },
    { id: "investimentos", label: "Investimentos" },
    { id: "presente", label: "Presente" },
    { id: "outros", label: "Outros" },
  ],
  output: [
    { id: "moradia", label: "Moradia" },
    { id: "mercado", label: "Mercado" },
    { id: "transporte", label: "Transporte" },
    { id: "contas", label: "Contas e serviços" },
    { id: "saude", label: "Saúde" },
    { id: "educacao", label: "Educação" },
    { id: "lazer", label: "Lazer" },
    { id: "outros", label: "Outros" },
  ],
};

export const DEFAULT_CATEGORY = "outros";

export const ALL_CATEGORY_IDS = [...new Set(Object.values(CATEGORIES).flat().map((c) => c.id))];

export const isCategoryOf = (type, id) => Boolean(CATEGORIES[type]?.some((c) => c.id === id));

export function categoryLabel(type, id) {
  return CATEGORIES[type]?.find((c) => c.id === id)?.label ?? "Outros";
}
