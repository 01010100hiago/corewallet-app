import { Router } from "express";
import { transactionSchema, transactionUpdateSchema, listQuerySchema, searchQuerySchema } from "@corewallet/shared";
import { validate, validateQuery } from "../middlewares/validate.js";
import { transactionController } from "../controllers/transactionController.js";

export function createTransactionRouter(authMiddleware) {
  const router = Router();

  router.use(authMiddleware);
  router.get("/", validateQuery(listQuerySchema), transactionController.list);
  router.post("/", validate(transactionSchema), transactionController.create);
  // "search" e "activity" vêm antes de "/:id", senão seriam lidos como um id.
  router.get("/search", validateQuery(searchQuerySchema), transactionController.search);
  router.get("/activity", transactionController.activity);
  router.get("/:id", transactionController.get);
  router.get("/:id/history", transactionController.history);
  router.put("/:id", validate(transactionUpdateSchema), transactionController.update);
  router.delete("/:id", transactionController.remove);
  router.post("/:id/restore", transactionController.restore);
  router.post("/:id/archive", transactionController.archive);
  router.post("/:id/unarchive", transactionController.unarchive);

  return router;
}
