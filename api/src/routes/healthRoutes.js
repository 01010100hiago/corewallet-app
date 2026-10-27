import { Router } from "express";
import { isDbConnected } from "../config/database.js";

const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  const db = isDbConnected() ? "up" : "down";
  res.status(db === "up" ? 200 : 503).json({ status: db === "up" ? "ok" : "degraded", db });
});

export default healthRouter;
