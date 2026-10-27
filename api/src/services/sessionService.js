import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import RefreshSession from "../models/RefreshSession.js";

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Duas abas podem renovar ao mesmo tempo: a segunda chega com o token que a
// primeira acabou de trocar. Dentro dessa janela isso é uma corrida normal, não roubo.
const GRACE_MS = 10_000;

const hash = (token) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const clip = (value, max) => String(value ?? "").slice(0, max);

export async function open(userId, { userAgent, ip }) {
  const token = newToken();
  const now = new Date();
  const session = await RefreshSession.create({
    userId,
    tokenHash: hash(token),
    userAgent: clip(userAgent, 300),
    ip: clip(ip, 64),
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
  });
  return { token, session };
}

// Troca o token de renovação por um novo (rotação). Devolve:
//  { status: "ok", token, session } | { status: "retry" } | { status: "invalid" }
export async function rotate(token, { userAgent, ip }) {
  if (typeof token !== "string" || !token || token.length > 200) return { status: "invalid" };
  const current = hash(token);
  const now = new Date();
  const next = newToken();

  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: current, expiresAt: { $gt: now } },
    { $set: { tokenHash: hash(next), prevHash: current, rotatedAt: now, lastUsedAt: now, userAgent: clip(userAgent, 300), ip: clip(ip, 64) } },
    { returnDocument: "after" }
  );
  if (session) return { status: "ok", token: next, session };

  const reused = await RefreshSession.findOne({ prevHash: current, expiresAt: { $gt: now } });
  if (!reused) return { status: "invalid" };
  if (now - reused.rotatedAt < GRACE_MS) return { status: "retry" };
  // Token antigo depois da janela: alguém ficou com uma cópia. Encerra a sessão.
  await reused.deleteOne();
  return { status: "invalid" };
}

export async function find(sessionId, userId) {
  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) return null;
  return RefreshSession.findOne({ _id: sessionId, userId, expiresAt: { $gt: new Date() } });
}

export const listByUser = (userId) =>
  RefreshSession.find({ userId, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).limit(50);

export async function revokeByToken(token) {
  if (typeof token !== "string" || !token || token.length > 200) return;
  const h = hash(token);
  await RefreshSession.deleteOne({ $or: [{ tokenHash: h }, { prevHash: h }] });
}

export async function revokeOne(sessionId, userId) {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const res = await RefreshSession.deleteOne({ _id: sessionId, userId });
  return res.deletedCount === 1;
}

export const revokeAll = (userId) => RefreshSession.deleteMany({ userId });
