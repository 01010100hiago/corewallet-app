import { Router } from "express";
import { pingDb } from "../config/database.js";

const healthRouter = Router();

healthRouter.get("/health", async (req, res) => {
  const up = await pingDb();
  res.status(up ? 200 : 503).json({ status: up ? "ok" : "degraded", db: up ? "up" : "down" });
});

export default healthRouter;
