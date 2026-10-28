import mongoose from "mongoose";
import User from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import * as sessions from "../services/sessionService.js";
import { cookieNames } from "../controllers/cookies.js";

export function createAuthMiddleware(jwtSecret, cookieSecure = false) {
  const SESSION_COOKIE = cookieNames(cookieSecure).session;
  return async function authMiddleware(req, res, next) {
    const token = req.cookies?.[SESSION_COOKIE];
    const access = typeof token === "string" ? verifyAccessToken(token, jwtSecret) : null;
    if (!access || !mongoose.isValidObjectId(access.userId)) {
      return res.status(401).json({ message: "Não autenticado" });
    }

    // O token só vale enquanto a sessão dele existir: encerrar um aparelho derruba
    // o acesso na hora, sem esperar o token curto vencer.
    const session = await sessions.find(access.sessionId, access.userId);
    const user = session && (await User.findById(access.userId));
    if (!user) return res.status(401).json({ message: "Não autenticado" });

    req.user = user;
    req.session = {
      id: session.id,
      startedAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      accessExpiresAt: access.expiresAt,
    };
    next();
  };
}
