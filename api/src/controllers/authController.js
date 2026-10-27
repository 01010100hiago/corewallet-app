import * as authService from "../services/authService.js";
import { signAccessToken, readSession, ACCESS_TTL_SECONDS } from "../services/tokenService.js";

export const SESSION_COOKIE = "cw_session";

// A hora do servidor vai junto: o front calcula o vencimento por ela, e não pelo
// relógio do aparelho, que pode estar adiantado ou atrasado.
const withServerTime = (session) => ({ ...session, serverTime: new Date().toISOString() });

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email });

export function createAuthController({ jwtSecret, cookieSecure }) {
  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/api",
  };

  return {
    async signup(req, res) {
      const user = await authService.signup(req.body);
      res.status(201).json(publicUser(user));
    },

    async signin(req, res) {
      const user = await authService.signin(req.body);
      const token = signAccessToken(user.id, jwtSecret);
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: ACCESS_TTL_SECONDS * 1000 });
      const { startedAt, expiresAt } = readSession(token);
      res.json({ ...publicUser(user), session: withServerTime({ startedAt, expiresAt }) });
    },

    logout(req, res) {
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      res.status(204).end();
    },

    me(req, res) {
      res.json({ ...publicUser(req.user), session: withServerTime(req.session) });
    },
  };
}
