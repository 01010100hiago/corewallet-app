function failure(res, error) {
  const errors = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "body";
    errors[field] ??= issue.message;
  }
  return res.status(422).json({ message: "Dados inválidos", errors });
}

// Valida o corpo da requisição com um schema Zod compartilhado.
// Só o resultado já limpo (req.body) segue adiante.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return failure(res, result.error);
    req.body = result.data;
    next();
  };
}

// Mesmo para a query string. No Express 5 req.query é só leitura, então o resultado
// limpo vai para req.validatedQuery.
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return failure(res, result.error);
    req.validatedQuery = result.data;
    next();
  };
}
