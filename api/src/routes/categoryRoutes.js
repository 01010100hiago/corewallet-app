import { Router } from "express";
import { newCategorySchema } from "@corewallet/shared";
import { validate } from "../middlewares/validate.js";
import * as categoryService from "../services/categoryService.js";

export function createCategoryRouter(authMiddleware) {
  const router = Router();
  router.use(authMiddleware);

  // Só as categorias criadas pela pessoa; as de fábrica vêm do pacote shared.
  router.get("/", async (req, res) => {
    res.json({ categories: await categoryService.listByUser(req.user.id) });
  });

  // 201 quando criou, 200 quando já existia (a pessoa só quer usar a categoria).
  router.post("/", validate(newCategorySchema), async (req, res) => {
    const { created, ...category } = await categoryService.create(req.user.id, req.body);
    res.status(created ? 201 : 200).json(category);
  });

  return router;
}
