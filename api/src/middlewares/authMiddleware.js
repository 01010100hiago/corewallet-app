import mongoose from "mongoose";
import User from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { SESSION_COOKIE } from "../controllers/authController.js";

export function createAuthMiddleware(jwtSecret) {
  return async function authMiddleware(req, res, next) {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = typeof token === "string" ? verifyAccessToken(token, jwtSecret) : null;
    if (!session || !mongoose.isValidObjectId(session.userId)) {
      return res.status(401).json({ message: "Não autenticado" });
    }

    const user = await User.findById(session.userId);
    if (!user) return res.status(401).json({ message: "Não autenticado" });

    req.user = user;
    req.session = { startedAt: session.startedAt, expiresAt: session.expiresAt };
    next();
  };
}
