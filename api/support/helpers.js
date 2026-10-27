export const testEnv = {
  jwtSecret: "segredo-de-teste-com-mais-de-32-caracteres!!",
  cookieSecure: false,
  webOrigin: "http://localhost:8080",
  port: 0,
  rateLimits: false,
};

export const user = (n = 1) => ({
  name: `Pessoa ${n}`,
  email: `pessoa${n}@exemplo.com`,
  password: "cavalo-azul-77",
});

// Os arquivos de teste rodam em paralelo; cada um usa o próprio banco para um não
// apagar os dados do outro. O nome continua terminando em _test (trava de segurança).
export function testDbUri(suffix) {
  const uri = process.env.TEST_DATABASE_URI;
  if (!uri) return undefined;
  return uri.replace(/\/([^/?]+)(\?|$)/, (all, name, tail) => `/${name.replace(/_test$/, "")}_${suffix}_test${tail}`);
}

// Valor do cookie anti-CSRF que o agente recebeu, para mandar no cabeçalho como o front faz.
export function csrfOf(agent) {
  const cookie = agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: true }).find((c) => c.name === "cw_csrf");
  return cookie?.value;
}
