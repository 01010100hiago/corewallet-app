import { z } from "zod";
import { parseToCents } from "./money.js";
import { ALL_CATEGORY_IDS, DEFAULT_CATEGORY, isCategoryOf, isCustomCategoryId } from "./categories.js";
import { isMonthKey, isDayKey } from "./months.js";
import { isCommonPassword, fitsBcrypt, PASSWORD_MAX_BYTES } from "./password.js";

export const PASSWORD_MIN = 8;
export const MAX_VALUE_CENTS = 100_000_000_00; // R$ 100 milhões

const email = z
  .string({ error: "O email é obrigatório" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Email inválido").max(254, "Email muito longo"));

const PASSWORD_TOO_LONG = `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes (acentos e emojis ocupam mais de 1)`;

const password = z
  .string({ error: "A senha é obrigatória" })
  .min(PASSWORD_MIN, `A senha precisa ter no mínimo ${PASSWORD_MIN} caracteres`)
  .refine(fitsBcrypt, PASSWORD_TOO_LONG);

const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

const capitalize = (name) =>
  name
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      if (i > 0 && NAME_PARTICLES.has(lower)) return lower;
      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");

// No cadastro a senha também não pode ser uma das mais comuns. No login isso não
// se aplica: quem já tem conta com uma senha fraca precisa conseguir entrar.
const newPassword = password.refine((p) => !isCommonPassword(p), "Essa senha é muito comum. Escolha outra");

const name = z
  .string({ error: "O nome é obrigatório" })
  .trim()
  .min(3, "O nome precisa ter no mínimo 3 caracteres")
  .max(80, "O nome pode ter no máximo 80 caracteres")
  .transform(capitalize);

export const signupSchema = z.object({
  name,
  email,
  password: newPassword,
});

// Tela "Complete seu perfil" (primeiro acesso com o Google): só o nome.
export const profileSchema = z.object({ name });

// Token que o botão do Google entrega ao navegador (um JWT).
export const googleCredentialSchema = z.object({
  credential: z.string({ error: "Credencial do Google ausente" }).min(20, "Credencial do Google inválida").max(4096, "Credencial do Google inválida"),
});

// Texto de limite do campo, para o front e a API usarem o mesmo.
export const NAME_MAX = 80;

// Formulário de cadastro: o mesmo schema da API mais a confirmação da senha.
export const signupFormSchema = signupSchema
  .extend({
    confirmPassword: z.string({ error: "Confirme a senha" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não correspondem",
    path: ["confirmPassword"],
  });

export const signinSchema = z.object({
  email,
  // No login não se revela a regra de tamanho, só se exige preenchimento.
  password: z
    .string({ error: "A senha é obrigatória" })
    .min(1, "A senha é obrigatória")
    .refine(fitsBcrypt, "Email ou senha incorretos"),
});

export const TRANSACTION_TYPES = ["input", "output"];

// Entrada do formulário e do corpo da API: o valor chega em reais ("12,50")
// e sai em centavos (inteiro).
const transactionFields = {
  value: z
    .union([z.string(), z.number()], { error: "O valor é obrigatório" })
    .transform((raw, ctx) => {
      const cents = parseToCents(raw);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 12,50" });
        return z.NEVER;
      }
      if (cents <= 0) {
        ctx.addIssue({ code: "custom", message: "O valor precisa ser maior que zero" });
        return z.NEVER;
      }
      if (cents > MAX_VALUE_CENTS) {
        ctx.addIssue({ code: "custom", message: "Valor acima do limite permitido" });
        return z.NEVER;
      }
      return cents;
    }),
  description: z
    .string({ error: "A descrição é obrigatória" })
    .trim()
    .min(3, "A descrição precisa ter no mínimo 3 caracteres")
    .max(100, "A descrição pode ter no máximo 100 caracteres"),
  category: z
    .string({ error: "Categoria inválida" })
    .refine((id) => ALL_CATEGORY_IDS.includes(id) || isCustomCategoryId(id), "Categoria inválida")
    .default(DEFAULT_CATEGORY),
};

// Campos que o formulário (e a edição) controlam. O tipo vem da tela/URL.
export const transactionFormSchema = z.object(transactionFields);
// Na edição a categoria é obrigatória: sem ela o padrão ("outros") apagaria, em silêncio,
// a categoria que o lançamento já tinha.
export const transactionUpdateSchema = z.object({
  ...transactionFields,
  category: z
    .string({ error: "A categoria é obrigatória" })
    .refine((id) => ALL_CATEGORY_IDS.includes(id) || isCustomCategoryId(id), "Categoria inválida"),
});

// Corpo de POST /transactions: a categoria precisa ser do tipo (não existe "Salário" numa saída).
export const transactionSchema = z
  .object({ ...transactionFields, type: z.enum(TRANSACTION_TYPES, { error: "Tipo inválido" }) })
  .superRefine((data, ctx) => {
    // Categoria da pessoa (id do Mongo): quem confere se existe e é do tipo é a API.
    if (!isCustomCategoryId(data.category) && !isCategoryOf(data.type, data.category)) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "Categoria não combina com o tipo do lançamento" });
    }
  });

// ?month=YYYY-MM em GET /transactions (opcional).
export const listQuerySchema = z.object({
  month: z.string().refine(isMonthKey, "Mês inválido. Use o formato 2026-10").optional(),
});

// Nome de categoria criada pela pessoa: 2 a 30 caracteres, começa com letra ou número.
export const categoryNameSchema = z
  .string({ error: "O nome da categoria é obrigatório" })
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "O nome precisa ter no mínimo 2 caracteres")
      .max(30, "O nome pode ter no máximo 30 caracteres")
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,&'+/-]*$/u, "Use só letras, números e espaços")
  );

export const newCategorySchema = z.object({
  type: z.enum(TRANSACTION_TYPES, { error: "Tipo inválido" }),
  name: categoryNameSchema,
});

// ?months=3|6|12 em GET /analysis (padrão 6): quantos meses, contando o atual, a análise cobre.
export const ANALYSIS_PERIODS = [3, 6, 12];
export const analysisQuerySchema = z.object({
  months: z
    .enum(ANALYSIS_PERIODS.map(String), { error: "Período inválido. Use 3, 6 ou 12 meses" })
    .default("6")
    .transform(Number),
});

// Corpo de PATCH /categories/:id: só o nome muda.
export const renameCategorySchema = z.object({ name: categoryNameSchema });

// Extrato (GET /transactions/search). Tudo é opcional. `status`: all = ativos e arquivados (padrão),
// active, archived ou deleted. from/to: dias (AAAA-MM-DD, inclusive) no horário de Brasília.
export const SEARCH_STATUSES = ["all", "active", "archived", "deleted"];
export const SEARCH_MAX_LIMIT = 100;
const anyCategory = z.string().refine((id) => ALL_CATEGORY_IDS.includes(id) || isCustomCategoryId(id), "Categoria inválida");
export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(100, "A busca pode ter no máximo 100 caracteres").optional(),
    type: z.enum(TRANSACTION_TYPES, { error: "Tipo inválido" }).optional(),
    category: anyCategory.optional(),
    status: z.enum(SEARCH_STATUSES, { error: "Situação inválida" }).default("all"),
    from: z.string().refine(isDayKey, "Data inicial inválida. Use AAAA-MM-DD").optional(),
    to: z.string().refine(isDayKey, "Data final inválida. Use AAAA-MM-DD").optional(),
    limit: z.coerce.number({ error: "Limite inválido" }).int().min(1).max(SEARCH_MAX_LIMIT).default(50),
    cursor: z.string().max(80).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from > q.to) ctx.addIssue({ code: "custom", path: ["to"], message: "A data final não pode ser antes da inicial" });
  });
