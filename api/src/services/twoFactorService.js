import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";
import QRCode from "qrcode";
import User from "../models/User.js";
import TwoFactorChallenge from "../models/TwoFactorChallenge.js";
import { createSecretBox } from "../lib/secretBox.js";
import { base32Encode, generateSecret, otpauthUri, verifyTotp, stepOf } from "../lib/totp.js";

export class TwoFactorError extends Error {
  constructor(message, status, errors, publicCode) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.publicCode = publicCode;
    this.expose = true;
  }
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Uma conferência por vez por desafio; se a instância morrer no meio, a trava vence sozinha.
const BUSY_MS = 15 * 1000;
const DUPLICATE_KEY = 11000;
const RECOVERY_COUNT = 10;
// Erros seguidos no segundo fator por CONTA (de qualquer IP); passou disso, a conta espera um tempo.
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const normalizeRecovery = (text) => String(text).toUpperCase().replace(/[\s-]/g, "");
const isTotpCode = (text) => /^\d{6}$/.test(text);

function newRecoveryCode() {
  const raw = base32Encode(randomBytes(7)).slice(0, 10); // 50 bits
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

// Verificação em duas etapas por aplicativo autenticador (TOTP), com códigos de recuperação.
// O segredo fica cifrado no banco (AES-256-GCM); o código de recuperação, só em hash.
export function createTwoFactor({ jwtSecret, encryptionKey = jwtSecret, issuer = "CoreWallet", now = () => Date.now(), challenges = TwoFactorChallenge }) {
  const box = createSecretBox(encryptionKey);
  const challengeKey = createHmac("sha256", jwtSecret).update("corewallet:2fa-challenge:v1").digest();
  const sign = (payload) => createHmac("sha256", challengeKey).update(payload).digest("base64url");

  // Prova de que a senha acabou de ser conferida: assinado, de curta duração e só serve para a 2ª etapa.
  function issueChallenge(userId) {
    const payload = Buffer.from(`${userId}.${now() + CHALLENGE_TTL_MS}.${randomBytes(12).toString("base64url")}`).toString("base64url");
    return `${payload}.${sign(payload)}`;
  }

  function readChallenge(token) {
    const [payload, signature] = String(token).split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const [userId, exp, nonce] = Buffer.from(payload, "base64url").toString().split(".");
    if (!userId || !nonce || Number(exp) <= now()) return null;
    return { userId, nonce, exp: Number(exp) };
  }

  const invalidChallenge = () => new TwoFactorError("Desafio inválido ou vencido. Entre de novo.", 401, undefined, "challenge_invalid");

  // Abre UMA conferência no desafio, de forma atômica no banco (vale entre instâncias da API): soma a
  // tentativa e marca o desafio como "em conferência". Se já há outra conferência em andamento, ou o
  // desafio já foi usado, o índice único do upsert recusa. Passou de 5 erros, o desafio morre (precisa
  // digitar a senha de novo).
  async function beginAttempt(challenge) {
    const t = now();
    const free = { _id: challenge.nonce, used: { $ne: true }, $or: [{ busyUntil: { $exists: false } }, { busyUntil: { $lte: new Date(t) } }] };
    let doc;
    try {
      doc = await challenges
        .findOneAndUpdate(free, { $inc: { attempts: 1 }, $set: { busyUntil: new Date(t + BUSY_MS) }, $setOnInsert: { exp: new Date(challenge.exp) } }, { upsert: true, returnDocument: "after" })
        .lean();
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) throw err;
      const current = await challenges.findById(challenge.nonce).lean();
      if (!current || current.used) throw invalidChallenge();
      throw new TwoFactorError("Aguarde a conferência anterior terminar.", 429, undefined, "challenge_busy");
    }
    if (doc.attempts > MAX_ATTEMPTS) {
      await challenges.updateOne({ _id: challenge.nonce }, { $set: { used: true }, $unset: { busyUntil: 1 } });
      throw new TwoFactorError("Muitas tentativas com este desafio. Entre de novo.", 429, undefined, "challenge_locked");
    }
  }

  // Fecha a conferência: acertou, o desafio fica gasto; errou, só libera para a próxima tentativa.
  const endAttempt = (challenge, ok) =>
    challenges.updateOne({ _id: challenge.nonce }, ok ? { $set: { used: true }, $unset: { busyUntil: 1 } } : { $unset: { busyUntil: 1 } });

  // Começa a ativação: gera um segredo novo e o guarda como pendente (cifrado) até a pessoa
  // provar, com um código, que o aplicativo está lendo o mesmo segredo.
  async function begin(user, password) {
    if (user.provider !== "password") {
      throw new TwoFactorError("Você entra pelo Google: ative a verificação em duas etapas na sua conta Google.", 409);
    }
    if (user.totpEnabled) throw new TwoFactorError("A verificação em duas etapas já está ativa.", 409);
    // Pede a senha: só a sessão aberta não basta para registrar um aplicativo (sessão roubada).
    const withHash = await User.findById(user._id).select("+passwordHash");
    if (!(withHash?.passwordHash && (await bcrypt.compare(password, withHash.passwordHash)))) {
      throw new TwoFactorError("Dados inválidos", 422, { password: "Senha incorreta" });
    }
    const secret = generateSecret();
    await User.updateOne({ _id: user._id }, { $set: { totpPendingSecret: box.seal(secret) } });
    const uri = otpauthUri({ secret, account: user.email, issuer });
    const svg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 224, errorCorrectionLevel: "M" });
    return { secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
  }

  // Confirma a ativação com o primeiro código e devolve os códigos de recuperação (só desta vez).
  async function enable(user, code) {
    const withSecrets = await User.findById(user._id).select("+totpPendingSecret");
    const secret = withSecrets?.totpPendingSecret && box.open(withSecrets.totpPendingSecret);
    if (!secret) throw new TwoFactorError("Comece de novo: gere um novo QR code.", 409);
    const step = verifyTotp(secret, code, { nowMs: now() });
    if (step === null) throw new TwoFactorError("Dados inválidos", 422, { code: "Código incorreto. Confira o horário do celular e tente o código novo." });
    const codes = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode);
    const done = await User.updateOne(
      // Só ativa o MESMO segredo que o código confirmou (um segundo "setup" no meio trocaria o pendente).
      // `$ne: true` e não `false`: conta criada antes do 2FA existir não tem o campo gravado no banco.
      { _id: user._id, totpEnabled: { $ne: true }, totpPendingSecret: withSecrets.totpPendingSecret },
      {
        $set: { totpEnabled: true, totpEnabledAt: new Date(now()), totpSecret: box.seal(secret), totpLastStep: step, recoveryCodes: codes.map((c) => sha256(normalizeRecovery(c))) },
        $unset: { totpPendingSecret: 1 },
      }
    );
    if (done.modifiedCount !== 1) throw new TwoFactorError("A verificação em duas etapas já está ativa.", 409);
    return codes;
  }

  // Confere o segundo fator (código do aplicativo ou de recuperação). O código do aplicativo só vale
  // uma vez (o passo de tempo é gravado); o de recuperação é apagado ao usar.
  async function check(userId, input) {
    const text = String(input).trim();
    const user = await User.findById(userId).select("+totpSecret +totpLastStep");
    if (!user?.totpEnabled) return false;
    if (isTotpCode(text)) {
      const secret = box.open(user.totpSecret ?? "");
      if (!secret) return false;
      const step = verifyTotp(secret, text, { nowMs: now() });
      if (step === null) return false;
      const claimed = await User.updateOne(
        { _id: userId, $or: [{ totpLastStep: { $lt: step } }, { totpLastStep: { $exists: false } }, { totpLastStep: null }] },
        { $set: { totpLastStep: step } }
      );
      return claimed.modifiedCount === 1;
    }
    const hash = sha256(normalizeRecovery(text));
    const burned = await User.updateOne({ _id: userId, recoveryCodes: hash }, { $pull: { recoveryCodes: hash } });
    return burned.modifiedCount === 1;
  }

  // Confere o segundo fator contando os erros por conta: 10 erros seguidos (de qualquer IP, em
  // qualquer desafio) travam a conta por 15 minutos. Acertar zera a contagem.
  async function guardedCheck(userId, input) {
    const account = await User.findById(userId).select("+totpLockedUntil");
    if (account?.totpLockedUntil && account.totpLockedUntil.getTime() > now()) {
      throw new TwoFactorError("Muitas tentativas. Aguarde alguns minutos e tente de novo.", 429, undefined, "account_locked");
    }
    const ok = await check(userId, input);
    if (ok) {
      await User.updateOne({ _id: userId }, { $set: { totpFails: 0 }, $unset: { totpLockedUntil: 1 } });
    } else {
      const after = await User.findOneAndUpdate({ _id: userId }, { $inc: { totpFails: 1 } }, { returnDocument: "after" }).select("+totpFails");
      if (after && after.totpFails >= MAX_FAILS) {
        await User.updateOne({ _id: userId }, { $set: { totpFails: 0, totpLockedUntil: new Date(now() + LOCK_MS) } });
      }
    }
    return ok;
  }

  // Segunda etapa do login.
  async function completeLogin(token, code) {
    const challenge = readChallenge(token);
    if (!challenge) throw invalidChallenge();
    // Uma conferência por vez por desafio: pedidos em paralelo com o mesmo desafio não furam o limite
    // de tentativas nem abrem duas sessões (nem em instâncias diferentes da API).
    await beginAttempt(challenge);
    let ok = false;
    try {
      ok = await guardedCheck(challenge.userId, code);
    } finally {
      await endAttempt(challenge, ok);
    }
    if (!ok) throw new TwoFactorError("Código incorreto", 401, undefined, "wrong_code");
    return User.findById(challenge.userId);
  }

  async function disable(user, { password, code }) {
    const withHash = await User.findById(user._id).select("+passwordHash");
    const ok = withHash?.passwordHash && (await bcrypt.compare(password, withHash.passwordHash));
    if (!ok) throw new TwoFactorError("Dados inválidos", 422, { password: "Senha incorreta" });
    if (!(await guardedCheck(user._id, code))) throw new TwoFactorError("Dados inválidos", 422, { code: "Código incorreto" });
    await User.updateOne(
      { _id: user._id },
      { $set: { totpEnabled: false }, $unset: { totpSecret: 1, totpPendingSecret: 1, totpLastStep: 1, recoveryCodes: 1, totpEnabledAt: 1 } }
    );
  }

  async function remainingRecoveryCodes(userId) {
    const user = await User.findById(userId).select("+recoveryCodes");
    return user?.recoveryCodes?.length ?? 0;
  }

  return { begin, enable, check, completeLogin, disable, issueChallenge, readChallenge, remainingRecoveryCodes, stepOf };
}
