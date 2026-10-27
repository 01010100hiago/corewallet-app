// Exige o token do captcha no corpo da requisição (campo captchaToken).
// Roda ANTES da validação do corpo, que descartaria esse campo.
export function requireCaptcha(captcha) {
  return async (req, res, next) => {
    if (!captcha.enabled) return next();

    const token = req.body?.captchaToken;
    if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
      return res.status(400).json({ message: "Confirme que você não é um robô." });
    }

    const result = await captcha.verify(token, req.ip);
    if (result === "invalid") {
      return res.status(403).json({ message: "Não foi possível confirmar que você não é um robô. Tente de novo." });
    }
    if (result === "unavailable") {
      return res.status(503).json({ message: "Não foi possível verificar o captcha agora. Tente de novo em instantes." });
    }
    next();
  };
}
