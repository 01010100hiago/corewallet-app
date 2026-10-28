// Categorias fixas: cada lançamento tem uma, e ela precisa combinar com o tipo.
// "outros" existe nos dois tipos e é o padrão (também dos lançamentos antigos).
export const CATEGORIES = {
  input: [
    { id: "salario", label: "Salário" },
    { id: "freelance", label: "Renda extra" },
    { id: "investimentos", label: "Rendimentos" },
    { id: "presente", label: "Presentes" },
    { id: "outros", label: "Outras receitas" },
  ],
  output: [
    { id: "moradia", label: "Moradia" },
    { id: "mercado", label: "Supermercado" },
    { id: "transporte", label: "Transporte" },
    { id: "contas", label: "Contas e serviços" },
    { id: "saude", label: "Saúde" },
    { id: "educacao", label: "Educação" },
    { id: "lazer", label: "Lazer" },
    { id: "outros", label: "Outras despesas" },
  ],
};

export const DEFAULT_CATEGORY = "outros";

export const ALL_CATEGORY_IDS = [...new Set(Object.values(CATEGORIES).flat().map((c) => c.id))];

export const isCategoryOf = (type, id) => Boolean(CATEGORIES[type]?.some((c) => c.id === id));

// Categorias criadas pela pessoa usam o ObjectId do Mongo (24 caracteres hexadecimais) como id.
export const CUSTOM_CATEGORY_ID = /^[0-9a-f]{24}$/;
export const isCustomCategoryId = (id) => typeof id === "string" && CUSTOM_CATEGORY_ID.test(id);
export const MAX_CUSTOM_CATEGORIES_PER_TYPE = 30;

// `custom` é a lista de categorias da pessoa: [{ id, type, name }].
export function categoryLabel(type, id, custom = []) {
  return (
    CATEGORIES[type]?.find((c) => c.id === id)?.label ??
    custom.find((c) => c.id === id && c.type === type)?.name ??
    "Outros"
  );
}

// Todas as categorias que a pessoa pode escolher para um tipo, no formato { id, label, custom }.
export function categoryOptions(type, custom = []) {
  return [
    ...(CATEGORIES[type] ?? []).map((c) => ({ ...c, custom: false })),
    ...custom.filter((c) => c.type === type).map((c) => ({ id: c.id, label: c.name, custom: true })),
  ];
}
