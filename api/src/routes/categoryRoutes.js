import { Router } from "express";
import { newCategorySchema, renameCategorySchema } from "@corewallet/shared";
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

  // Quantos lançamentos usam cada categoria (para a página de categorias).
  router.get("/usage", async (req, res) => {
    res.json({ usage: await categoryService.usageByUser(req.user.id) });
  });

  router.patch("/:id", validate(renameCategorySchema), async (req, res) => {
    const category = await categoryService.rename(req.user.id, req.params.id, req.body.name);
    if (!category) return res.status(404).json({ message: "Categoria não encontrada" });
    res.json(category);
  });

  // ?moveTo=<categoria> diz para onde vão os lançamentos que usam esta; sem eles não precisa.
  router.delete("/:id", async (req, res) => {
    const moveTo = typeof req.query.moveTo === "string" ? req.query.moveTo : undefined;
    const result = await categoryService.remove(req.user.id, req.params.id, moveTo);
    if (!result) return res.status(404).json({ message: "Categoria não encontrada" });
    res.json(result);
  });

  return router;
}
