import { Router } from "express";
import { signupSchema, signinSchema, profileSchema, googleCredentialSchema, signin2faSchema, twoFactorSetupSchema, twoFactorEnableSchema, twoFactorDisableSchema, emailTokenSchema, resendEmailSchema } from "@corewallet/shared";
import { validate } from "../middlewares/validate.js";
import { requireCaptcha } from "../middlewares/captcha.js";
import { createAuthController } from "../controllers/authController.js";

export function createAuthRouter(deps, authMiddleware, limiters) {
  const controller = createAuthController(deps);
  const captcha = requireCaptcha(deps.captcha);
  const router = Router();

  router.get("/config", controller.config);
  router.get("/challenge", limiters.challenge, controller.challenge);
  // O captcha vem antes da validação, que descartaria o campo captchaToken.
  router.post("/signup", limiters.signup, captcha, validate(signupSchema), controller.signup);
  router.post("/signin", limiters.signin, limiters.signinAccount, captcha, validate(signinSchema), controller.signin);
  router.post("/signin/2fa", limiters.signin, limiters.twoFactor, validate(signin2faSchema), controller.signin2fa);
  router.post("/email/verify", limiters.email, validate(emailTokenSchema), controller.verifyEmail);
  router.post("/email/resend", limiters.email, validate(resendEmailSchema), limiters.emailTarget, controller.resendEmail);
  router.get("/2fa", authMiddleware, controller.twoFactorStatus);
  router.post("/2fa/setup", authMiddleware, limiters.twoFactor, validate(twoFactorSetupSchema), controller.twoFactorSetup);
  router.post("/2fa/enable", authMiddleware, limiters.twoFactor, validate(twoFactorEnableSchema), controller.twoFactorEnable);
  router.post("/2fa/disable", authMiddleware, limiters.twoFactor, validate(twoFactorDisableSchema), controller.twoFactorDisable);
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
