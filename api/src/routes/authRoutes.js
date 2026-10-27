import { Router } from "express";
import { signupSchema, signinSchema, profileSchema, googleCredentialSchema } from "@corewallet/shared";
import { validate } from "../middlewares/validate.js";
import { requireCaptcha } from "../middlewares/captcha.js";
import { createAuthController } from "../controllers/authController.js";

export function createAuthRouter(deps, authMiddleware, limiters) {
  const controller = createAuthController(deps);
  const captcha = requireCaptcha(deps.captcha);
  const router = Router();

  router.get("/config", controller.config);
  // O captcha vem antes da validação, que descartaria o campo captchaToken.
  router.post("/signup", limiters.signup, captcha, validate(signupSchema), controller.signup);
  router.post("/signin", limiters.signin, limiters.signinAccount, captcha, validate(signinSchema), controller.signin);
  // Entrar com o Google não leva captcha: o próprio Google já filtra robôs.
  router.get("/google/nonce", limiters.google, controller.googleNonce);
  router.post("/google", limiters.google, validate(googleCredentialSchema), controller.googleSignin);
  router.post("/refresh", limiters.refresh, controller.refresh);
  router.post("/logout", controller.logout);
  router.post("/logout-all", authMiddleware, controller.logoutAll);
  router.get("/sessions", authMiddleware, controller.listSessions);
  router.delete("/sessions/:id", authMiddleware, controller.revokeSession);
  router.get("/me", authMiddleware, controller.me);
  router.patch("/profile", authMiddleware, validate(profileSchema), controller.updateProfile);

  return router;
}
