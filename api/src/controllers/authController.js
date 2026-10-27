import { createHmac, randomBytes } from "node:crypto";
import * as authService from "../services/authService.js";
import { AuthError } from "../services/authService.js";
import * as sessions from "../services/sessionService.js";
import User from "../models/User.js";
import { signAccessToken, accessExpiry, verifyAccessToken, ACCESS_TTL_SECONDS } from "../services/tokenService.js";
import { describeDevice, maskIp } from "../lib/device.js";
import { SESSION_COOKIE, REFRESH_COOKIE, CSRF_COOKIE } from "./cookies.js";

const NONCE_COOKIE = "cw_gnonce";
const NONCE_TTL_SECONDS = 5 * 60;

// O cookie guarda um segredo da tentativa ("<vence em ms>.<aleatório>") que só o
// navegador e a API conhecem. O nonce que vai DENTRO do token do Google é um HMAC
// desse segredo, calculado com a chave da API. Quem rouba o token lê o nonce, mas
// não consegue montar o cookie que o gera, então não consegue reutilizá-lo.
const nonceFor = (secret, key) => createHmac("sha256", key).update(`google-nonce:${secret}`).digest("hex");

// Devolve o nonce esperado para o cookie recebido, ou "" se o cookie for inválido ou vencido.
function expectedNonce(cookie, key, now = Date.now()) {
  if (typeof cookie !== "string") return "";
  const match = /^(\d{10,15})\.([0-9a-f]{32})$/.exec(cookie);
  if (!match || Number(match[1]) <= now) return "";
  return nonceFor(cookie, key);
}


// A hora do servidor vai junto: o front calcula o vencimento por ela, e não pelo
// relógio do aparelho, que pode estar adiantado ou atrasado.
const withServerTime = (session) => ({ ...session, serverTime: new Date().toISOString() });

// startedAt/expiresAt são da sessão do aparelho (até 30 dias); accessExpiresAt é
// quando o token curto precisa ser renovado.
const sessionBody = (session, accessExpiresAt) =>
  withServerTime({ startedAt: session.createdAt.toISOString(), expiresAt: session.expiresAt.toISOString(), accessExpiresAt });

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  provider: user.provider,
  profileComplete: user.profileComplete,
  emailVerified: Boolean(user.emailVerified),
  twoFactorEnabled: Boolean(user.totpEnabled),
  createdAt: user.createdAt,
});

export function createAuthController({ env, captcha, google, emailVerification, twoFactor }) {
  const baseCookie = { httpOnly: true, secure: env.cookieSecure, sameSite: "lax" };
  const sessionCookie = { ...baseCookie, path: "/api" };
  const refreshCookie = { ...baseCookie, sameSite: "strict", path: "/api/auth" };
  const csrfCookie = { secure: env.cookieSecure, sameSite: "lax", path: "/" };
  const nonceCookie = { ...baseCookie, path: "/api/auth" };

  const meta = (req) => ({ userAgent: req.get("user-agent"), ip: req.ip });

  // Os três cookies da sessão: acesso (curto), renovação (longo, só a rota /auth o
  // recebe, SameSite=Strict) e o token anti-CSRF (legível pelo JavaScript do site).
  function setSessionCookies(res, user, session, refreshToken) {
    const access = signAccessToken(user.id, session.id, env.jwtSecret);
    const remaining = Math.max(session.expiresAt.getTime() - Date.now(), 0);
    res.cookie(SESSION_COOKIE, access, { ...sessionCookie, maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookie, maxAge: remaining });
    res.cookie(CSRF_COOKIE, randomBytes(24).toString("base64url"), { ...csrfCookie, maxAge: remaining });
    return sessionBody(session, accessExpiry(access));
  }

  function clearSessionCookies(res) {
    res.clearCookie(SESSION_COOKIE, sessionCookie);
    res.clearCookie(REFRESH_COOKIE, refreshCookie);
    res.clearCookie(CSRF_COOKIE, csrfCookie);
  }

  async function startSession(req, res, user) {
    const { token, session } = await sessions.open(user.id, meta(req));
    res.json({ ...publicUser(user), session: setSessionCookies(res, user, session, token) });
  }

  return {
    // O que o front precisa saber para mostrar captcha e botão do Google.
    // Só chaves públicas: o segredo do captcha nunca sai da API.
    config(req, res) {
      res.json({
        captcha: !captcha.enabled
          ? null
          : captcha.provider === "pow"
            ? { provider: "pow" }
            : { provider: "turnstile", siteKey: env.turnstile.siteKey },
        google: google.enabled ? { clientId: env.googleClientId } : null,
        emailVerification: Boolean(env.emailVerificationRequired),
      });
    },

    // Desafio da verificação automática. Só existe quando ela é a ligada (sem Turnstile).
    challenge(req, res) {
      if (!captcha.challenge) return res.status(404).json({ message: "Rota não encontrada" });
      res.json(captcha.challenge());
    },

    async signup(req, res) {
      const user = await authService.signup(req.body, { takeoverUnverified: Boolean(env.emailVerificationRequired) });
      if (!env.emailVerificationRequired) return res.status(201).json(publicUser(user));
      // Falha no envio não desfaz o cadastro: a tela oferece reenviar.
      const verificationSent = await emailVerification.issue(user);
      res.status(201).json({ ...publicUser(user), verificationRequired: true, verificationSent });
    },

    async signin(req, res) {
      const user = await authService.signin(req.body);
      // Só quem acertou a senha descobre que falta confirmar o email (não revela se o email existe).
      if (env.emailVerificationRequired && user.provider === "password" && !user.emailVerified) {
        throw new AuthError("Confirme seu email para entrar. Use o link que enviamos no cadastro ou peça um novo.", 403, "email_not_verified");
      }
      // Com a verificação em duas etapas, a senha sozinha não abre a sessão: devolve um desafio curto.
      if (user.totpEnabled) return res.json({ twoFactorRequired: true, challenge: twoFactor.issueChallenge(user.id) });
      await startSession(req, res, user);
    },

    async signin2fa(req, res) {
      const user = await twoFactor.completeLogin(req.body.challenge, req.body.code);
      if (!user) throw new AuthError("Desafio inválido ou vencido. Entre de novo.", 401);
      await startSession(req, res, user);
    },

    async verifyEmail(req, res) {
      if (!(await emailVerification.confirm(req.body.token))) {
        return res.status(400).json({ message: "Link inválido ou vencido. Peça um novo email de confirmação." });
      }
      res.json({ verified: true });
    },

    // Sempre a mesma resposta, exista a conta ou não.
    async resendEmail(req, res) {
      // Responde antes de trabalhar: o tempo da resposta não revela se a conta existe, e uma falha
      // no envio não vira um erro que só algumas contas teriam.
      res.status(202).json({ message: "Se existir uma conta com este email que ainda não foi confirmada, enviamos um novo link (no máximo um por minuto). Olhe também o spam." });
      if (!env.emailVerificationRequired) return;
      try {
        await emailVerification.resend(req.body.email);
      } catch (err) {
        console.error("Falha ao reenviar o email de confirmação:", err.message);
      }
    },

    async twoFactorStatus(req, res) {
      res.json({ enabled: Boolean(req.user.totpEnabled), recoveryCodesLeft: req.user.totpEnabled ? await twoFactor.remainingRecoveryCodes(req.user.id) : 0 });
    },

    async twoFactorSetup(req, res) {
      res.json(await twoFactor.begin(req.user, req.body.password));
    },

    async twoFactorEnable(req, res) {
      const recoveryCodes = await twoFactor.enable(req.user, req.body.code);
      // Quem tinha uma sessão aberta antes de ativar o 2FA (sem o segundo fator) é desconectado, menos este aparelho.
      await sessions.revokeOthers(req.user.id, req.session.id);
      res.json({ recoveryCodes });
    },

    async twoFactorDisable(req, res) {
      await twoFactor.disable(req.user, req.body);
      res.status(204).end();
    },

    // Entrega um nonce ao navegador, guardado também num cookie. O token do Google
    // só vale se trouxer esse mesmo nonce, então não adianta roubá-lo e usar em outro lugar.
    googleNonce(req, res) {
      const secret = `${Date.now() + NONCE_TTL_SECONDS * 1000}.${randomBytes(16).toString("hex")}`;
      res.cookie(NONCE_COOKIE, secret, { ...nonceCookie, maxAge: NONCE_TTL_SECONDS * 1000 });
      res.json({ nonce: nonceFor(secret, env.jwtSecret) });
    },

    async googleSignin(req, res) {
      const expected = expectedNonce(req.cookies?.[NONCE_COOKIE], env.jwtSecret);
      // A tentativa vale uma vez só, deu certo ou não.
      res.clearCookie(NONCE_COOKIE, nonceCookie);
      const profile = await google.verify(req.body.credential, expected);
      await startSession(req, res, await authService.googleSignin(profile, { releaseUnverified: Boolean(env.emailVerificationRequired) }));
    },

    async updateProfile(req, res) {
      const user = await authService.completeProfile(req.user, req.body);
      res.json({ ...publicUser(user), session: withServerTime(req.session) });
    },

    async refresh(req, res) {
      const result = await sessions.rotate(req.cookies?.[REFRESH_COOKIE], meta(req));
      if (result.status === "retry") {
        return res.status(409).json({ message: "Renovação em andamento. Tente de novo." });
      }
      const user = result.status === "ok" && (await User.findById(result.session.userId));
      if (!user) {
        clearSessionCookies(res);
        return res.status(401).json({ message: "Sessão encerrada" });
      }
      res.json({ ...publicUser(user), session: setSessionCookies(res, user, result.session, result.token) });
    },

    // Funciona mesmo com o token de acesso vencido: sair não pode depender dele.
    async logout(req, res) {
      await sessions.revokeByToken(req.cookies?.[REFRESH_COOKIE]);
      const access = verifyAccessToken(req.cookies?.[SESSION_COOKIE] ?? "", env.jwtSecret);
      if (access) await sessions.revokeOne(access.sessionId, access.userId);
      clearSessionCookies(res);
      res.status(204).end();
    },

    async logoutAll(req, res) {
      await sessions.revokeAll(req.user.id);
      clearSessionCookies(res);
      res.status(204).end();
    },

    async listSessions(req, res) {
      const list = await sessions.listByUser(req.user.id);
      res.json(
        list.map((s) => ({
          id: s.id,
          current: s.id === req.session.id,
          device: describeDevice(s.userAgent),
          ip: maskIp(s.ip),
          startedAt: s.createdAt.toISOString(),
          lastUsedAt: s.lastUsedAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        }))
      );
    },

    async revokeSession(req, res) {
      if (!(await sessions.revokeOne(req.params.id, req.user.id))) {
        return res.status(404).json({ message: "Sessão não encontrada" });
      }
      if (req.params.id === req.session.id) clearSessionCookies(res);
      res.status(204).end();
    },

    me(req, res) {
      // Quem já estava logado antes do CSRF existir (ou perdeu o cookie) recebe um.
      if (!req.cookies?.[CSRF_COOKIE]) {
        res.cookie(CSRF_COOKIE, randomBytes(24).toString("base64url"), {
          ...csrfCookie,
          maxAge: Math.max(new Date(req.session.expiresAt) - Date.now(), 0),
        });
      }
      res.json({ ...publicUser(req.user), session: withServerTime(req.session) });
    },
  };
}
