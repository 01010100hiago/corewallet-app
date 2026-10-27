export const testEnv = {
  jwtSecret: "segredo-de-teste-com-mais-de-32-caracteres!!",
  cookieSecure: false,
  webOrigin: "http://localhost:8080",
  port: 0,
};

export const user = (n = 1) => ({
  name: `Pessoa ${n}`,
  email: `pessoa${n}@exemplo.com`,
  password: "cavalo-azul-77",
});
