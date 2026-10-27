import { z } from "zod";
import { parseToCents } from "./money.js";
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

export const signupSchema = z.object({
  name: z
    .string({ error: "O nome é obrigatório" })
    .trim()
    .min(3, "O nome precisa ter no mínimo 3 caracteres")
    .max(80, "O nome pode ter no máximo 80 caracteres")
    .transform(capitalize),
  email,
  password: newPassword,
});

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
export const transactionSchema = z.object({
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
  type: z.enum(TRANSACTION_TYPES, { error: "Tipo inválido" }),
});
