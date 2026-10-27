// Regras de senha usadas no cadastro (API e front) e no medidor de força.

// Senhas que aparecem em todas as listas de vazamento. A lista é curta de propósito:
// pega o que mais se repete (inclusive em português) sem virar um dicionário gigante.
const COMMON = new Set(`
12345678 123456789 1234567890 12345678910 87654321 987654321 11111111 00000000 12341234 123123123
qwertyui qwerty123 qwertyuiop 1q2w3e4r 1q2w3e4r5t q1w2e3r4 zxcvbnm1 asdfghjk asdf1234 asdfghjkl
password password1 password12 password123 passw0rd p@ssw0rd p@ssword senha123 senha1234 senha12345
minhasenha minhasenha123 mudar123 mudar@123 trocar123 admin123 admin1234 administrador letmein123
iloveyou iloveyou1 welcome1 welcome123 abc12345 abcd1234 abcdefgh abcdefg1 teste123 teste1234
brasil123 brasil2024 brasil2025 brasil2026 flamengo corinthians palmeiras saopaulo santos123 gremio123
amorzinho meuamor123 princesa123 felipe123 gabriel123 123mudar 12345abc 1234abcd
`.split(/\s+/).filter(Boolean));

// Todos os caracteres iguais ("aaaaaaaa") ou uma sequência simples ("abcdefgh", "12345678").
function isTrivial(password) {
  if (/^(.)\1+$/.test(password)) return true;
  const codes = [...password].map((c) => c.codePointAt(0));
  const step = codes[1] - codes[0];
  return Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
}

export function isCommonPassword(password) {
  return COMMON.has(password.toLowerCase()) || isTrivial(password);
}

// O bcrypt corta a senha em 72 BYTES, e acento ou emoji ocupam 2 a 4 bytes cada.
// Por isso o limite é medido em bytes, senão o excedente seria ignorado em silêncio.
export const PASSWORD_MAX_BYTES = 72;
export const byteLength = (text) => new TextEncoder().encode(text).length;
export const fitsBcrypt = (text) => byteLength(text) <= PASSWORD_MAX_BYTES;

// Cada item diz se é obrigatório (o cadastro recusa sem ele) ou só recomendado.
export function evaluatePassword(password) {
  const checks = [
    { id: "length", label: "8 ou mais caracteres", required: true, ok: password.length >= 8 },
    { id: "common", label: "Não é uma senha comum", required: true, ok: password.length > 0 && !isCommonPassword(password) },
    { id: "mix", label: "Mistura letras e números", required: false, ok: /\p{L}/u.test(password) && /\d/.test(password) },
    { id: "long", label: "12 ou mais caracteres", required: false, ok: password.length >= 12 },
  ];

  // Esta regra só aparece quando é violada (senha muito longa), para não poluir a lista.
  if (!fitsBcrypt(password)) {
    checks.splice(2, 0, { id: "bytes", label: `No máximo ${PASSWORD_MAX_BYTES} bytes (acentos e emojis contam mais)`, required: true, ok: false });
  }

  const requiredOk = checks.filter((c) => c.required).every((c) => c.ok);
  // 0 = vazia, 1 = recusada, 2 = aceita, 3 = boa, 4 = forte
  let score = 0;
  if (password.length > 0) score = 1;
  if (requiredOk) score = 2 + checks.filter((c) => !c.required && c.ok).length;
  const labels = ["", "Fraca", "Razoável", "Boa", "Forte"];
  return { checks, score, label: labels[score], acceptable: requiredOk };
}
