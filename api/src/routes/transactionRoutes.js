import { Router } from "express";
import { transactionSchema } from "@corewallet/shared";
import { validate } from "../middlewares/validate.js";
import { transactionController } from "../controllers/transactionController.js";

export function createTransactionRouter(authMiddleware) {
  const router = Router();

  router.use(authMiddleware);
  router.get("/", transactionController.list);
  router.post("/", validate(transactionSchema), transactionController.create);

  return router;
}
