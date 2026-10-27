import { Router } from "express";
import { signupSchema, signinSchema } from "@corewallet/shared";
import { validate } from "../middlewares/validate.js";
import { createAuthController } from "../controllers/authController.js";

export function createAuthRouter(env, authMiddleware) {
  const controller = createAuthController(env);
  const router = Router();

  router.post("/signup", validate(signupSchema), controller.signup);
  router.post("/signin", validate(signinSchema), controller.signin);
  router.post("/logout", controller.logout);
  router.get("/me", authMiddleware, controller.me);

  return router;
}
