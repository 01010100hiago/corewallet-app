import { timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, REFRESH_COOKIE, CSRF_COOKIE } from "../controllers/cookies.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// Quem ainda não tem sessão (login, cadastro) não tem o que roubar; a renovação só
// usa um cookie SameSite=Strict e precisa funcionar mesmo se o token CSRF sumiu.
const NO_TOKEN = new Set(["/auth/signin", "/auth/signup", "/auth/google", "/auth/refresh"]);

// Origem do próprio site: a configurada ou a que o navegador usou para chegar aqui.
// Só o host é comparado (com porta): atrás do túnel/nginx o esquema (http/https) se perde.
function ownOrigin(origin, req, env) {
  if (origin === env.webOrigin) return true;
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Defesa em duas camadas para requisições que mudam dados:
// 1) se o navegador mandou Origin, ela precisa ser a do próprio site;
// 2) com sessão aberta, o cabeçalho X-CSRF-Token precisa repetir o cookie cw_csrf,
//    que só páginas do nosso site conseguem ler.
export function createCsrf(env) {
  return function csrf(req, res, next) {
    if (SAFE.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin && !ownOrigin(origin, req, env)) {
      return res.status(403).json({ message: "Origem não permitida" });
    }

    const hasSession = req.cookies?.[SESSION_COOKIE] || req.cookies?.[REFRESH_COOKIE];
    if (!hasSession || NO_TOKEN.has(req.path)) return next();

    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.get("x-csrf-token");
    if (typeof cookie !== "string" || typeof header !== "string" || !cookie || !same(cookie, header)) {
      return res.status(403).json({ message: "Requisição recusada. Recarregue a página e tente de novo." });
    }
    next();
  };
}
