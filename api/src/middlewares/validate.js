// Valida o corpo da requisição com um schema Zod compartilhado.
// Só o resultado já limpo (req.body) segue adiante.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join(".") || "body";
        errors[field] ??= issue.message;
      }
      return res.status(422).json({ message: "Dados inválidos", errors });
    }
    req.body = result.data;
    next();
  };
}
