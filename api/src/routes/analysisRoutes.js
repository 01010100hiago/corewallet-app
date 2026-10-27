import { Router } from "express";
import { DEFAULT_CATEGORY, analysisQuerySchema } from "@corewallet/shared";
import { validateQuery } from "../middlewares/validate.js";
import * as analysisService from "../services/analysisService.js";
import * as categoryService from "../services/categoryService.js";

export function createAnalysisRouter(authMiddleware) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", validateQuery(analysisQuerySchema), async (req, res) => {
    const [result, customCategories] = await Promise.all([
      analysisService.analyze(req.user.id, { months: req.validatedQuery.months }),
      categoryService.listByUser(req.user.id),
    ]);
    res.json({
      ...result,
      customCategories,
      topExpenses: result.topExpenses.map((t) => ({
        id: String(t._id),
        value: t.valueCents,
        description: t.description,
        category: t.category ?? DEFAULT_CATEGORY,
        createdAt: t.createdAt,
      })),
    });
  });

  return router;
}
