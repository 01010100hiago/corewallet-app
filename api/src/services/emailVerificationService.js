import { createHash, randomBytes } from "node:crypto";
import User from "../models/User.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Confirmação de email por link de uso único. O banco guarda só o hash do token: quem lê o banco
// não consegue montar um link. Falha no envio nunca derruba o cadastro; a pessoa pode pedir de novo.
export function createEmailVerification({ mailer, webOrigin, now = () => Date.now() }) {
  async function issue(user) {
    try {
      const token = randomBytes(32).toString("base64url");
      const at = now();
      await User.updateOne(
        { _id: user._id, emailVerified: { $ne: true } },
        { $set: { emailVerifyHash: sha256(token), emailVerifyExpires: new Date(at + TTL_MS), emailVerifySentAt: new Date(at) } }
      );
      const link = `${webOrigin.replace(/\/$/, "")}/verify-email?token=${token}`;
      // Só o primeiro nome, só letras: o texto vai para um email da NOSSA origem, endereçado a quem digitou o email.
      const first = greetingName(user.name);
      const hello = first ? `Olá, ${first}!` : "Olá!";
      await mailer.send({
        to: user.email,
        subject: "Confirme seu email no CoreWallet",
        text: `${hello}\n\nAlguém (provavelmente você) criou uma conta no CoreWallet com este email. Para ativá-la, abra este link (vale por 24 horas):\n${link}\n\nSe não foi você, ignore este email: nada será ativado.`,
        html: `<p>${escapeHtml(hello)}</p><p>Alguém (provavelmente você) criou uma conta no CoreWallet com este email. Para ativá-la, <a href="${link}">confirme seu email</a> (o link vale por 24 horas).</p><p>Se não foi você, ignore este email: nada será ativado.</p>`,
      });
      return true;
    } catch (err) {
      console.error("Falha ao enviar o email de confirmação:", err.message);
      return false;
    }
  }

  // Marca o email como confirmado e apaga o link: cada link vale uma vez.
  async function confirm(token) {
    const user = await User.findOneAndUpdate(
      { emailVerifyHash: sha256(String(token)), emailVerifyExpires: { $gt: new Date(now()) } },
      { $set: { emailVerified: true }, $unset: { emailVerifyHash: 1, emailVerifyExpires: 1, emailVerifySentAt: 1 } },
      { returnDocument: "after" }
    );
    return user ?? null;
  }

  // Reenvio. A resposta da API é sempre a mesma, exista a conta ou não, para não revelar quais
  // emails têm conta. No máximo um email por minuto por conta.
  async function resend(email) {
    // O intervalo é "reservado" na própria busca (atômico): pedidos em paralelo não passam todos.
    const cutoff = new Date(now() - RESEND_AFTER_MS);
    const user = await User.findOneAndUpdate(
      { email, provider: "password", emailVerified: { $ne: true }, $or: [{ emailVerifySentAt: { $lt: cutoff } }, { emailVerifySentAt: { $exists: false } }] },
      { $set: { emailVerifySentAt: new Date(now()) } },
      { returnDocument: "after" }
    );
    if (!user) return false;
    return issue(user);
  }

  return { issue, confirm, resend };
}

const greetingName = (name) =>
  String(name ?? "")
    .replace(/[^\p{L} '’-]/gu, "")
    .trim()
    .split(/\s+/)[0]
    .slice(0, 30);

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
