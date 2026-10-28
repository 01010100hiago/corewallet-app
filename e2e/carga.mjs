// Teste de carga simples, sem dependências: N conexões em paralelo durante alguns segundos contra uma rota.
//   node e2e/carga.mjs --url http://localhost:8091 --cenario config --conexoes 32 --segundos 10
// Cenários:
//   config       GET /api/auth/config            (rota leve, passa pelo limite geral)
//   login        POST /api/auth/signin           (bcrypt: pesado em CPU)
//   lancamentos  GET /api/transactions           (logado; lê do Mongo)
// Para login e lancamentos a API precisa estar com CAPTCHA_POW=off e RATE_LIMITS=off (só em desenvolvimento).
import http from "node:http";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const base = new URL(args.url ?? "http://localhost:8080");
const scenario = args.cenario ?? "config";
const connections = Number(args.conexoes ?? 32);
const seconds = Number(args.segundos ?? 10);
const agent = new http.Agent({ keepAlive: true, maxSockets: connections });

function call(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      { host: base.hostname, port: base.port, path, method, agent, headers: { Origin: base.origin, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on("error", reject);
    req.setTimeout(20_000, () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

const user = { name: "Carga Teste", email: `carga-${process.pid}@exemplo.com`, password: "cavalo-azul-77" };
let cookie = "";
async function prepare() {
  if (scenario === "config") return () => call("GET", "/api/auth/config");
  const signup = await call("POST", "/api/auth/signup", { body: user });
  if (signup.status !== 201) throw new Error(`cadastro falhou (${signup.status}): ${signup.body.slice(0, 120)}. A API está com CAPTCHA_POW=off e RATE_LIMITS=off?`);
  if (scenario === "login") return () => call("POST", "/api/auth/signin", { body: { email: user.email, password: user.password } });
  if (scenario === "lancamentos") {
    const signin = await call("POST", "/api/auth/signin", { body: { email: user.email, password: user.password } });
    cookie = signin.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ");
    return () => call("GET", "/api/transactions", { headers: { Cookie: cookie } });
  }
  throw new Error(`cenário desconhecido: ${scenario}`);
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const request = await prepare();
// Aquecimento (JIT, conexões) fora da medida.
await Promise.all(Array.from({ length: Math.min(connections, 8) }, () => request().catch(() => {})));

const latencies = [];
const statuses = new Map();
const endAt = Date.now() + seconds * 1000;
async function worker() {
  while (Date.now() < endAt) {
    const t0 = performance.now();
    try {
      const res = await request();
      latencies.push(performance.now() - t0);
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    } catch {
      statuses.set("erro", (statuses.get("erro") ?? 0) + 1);
    }
  }
}
const started = performance.now();
await Promise.all(Array.from({ length: connections }, worker));
const elapsed = (performance.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const ok = statuses.get(200) ?? 0;
console.log(
  JSON.stringify({
    cenario: scenario,
    conexoes: connections,
    segundos: Number(elapsed.toFixed(1)),
    pedidos: latencies.length,
    porSegundo: Math.round(latencies.length / elapsed),
    p50ms: Number(percentile(latencies, 50).toFixed(1)),
    p95ms: Number(percentile(latencies, 95).toFixed(1)),
    p99ms: Number(percentile(latencies, 99).toFixed(1)),
    status: Object.fromEntries(statuses),
    ok200: ok,
  })
);
agent.destroy();
