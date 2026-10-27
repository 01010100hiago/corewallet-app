import { Router } from "express";
import { transactionSchema, transactionUpdateSchema, listQuerySchema } from "@corewallet/shared";
import { validate, validateQuery } from "../middlewares/validate.js";
import { transactionController } from "../controllers/transactionController.js";

export function createTransactionRouter(authMiddleware) {
  const router = Router();

  router.use(authMiddleware);
  router.get("/", validateQuery(listQuerySchema), transactionController.list);
  router.post("/", validate(transactionSchema), transactionController.create);
  router.get("/:id", transactionController.get);
  router.put("/:id", validate(transactionUpdateSchema), transactionController.update);
  router.delete("/:id", transactionController.remove);

  return router;
}
