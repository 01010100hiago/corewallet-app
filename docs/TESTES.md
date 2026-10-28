# Testes

Quatro camadas, todas no CI do GitHub.

| Camada | Ferramenta | O que cobre |
|---|---|---|
| `shared/` | `node --test` | schemas, dinheiro, senha, categorias e meses |
| API | `node --test` + Supertest, contra um Mongo de verdade | autenticação, sessões e renovação, CSRF, limite de tentativas, 2FA, confirmação de email, lançamentos, histórico, exclusão e arquivamento, categorias e análise |
| Front | Vitest + Testing Library | telas, sessão, renovação automática, cálculos da análise e acessibilidade |
| Ponta a ponta (`e2e/`) | Playwright (Chromium) | a jornada inteira no navegador, inclusive no celular, a renovação silenciosa da sessão, o CSRF, os dispositivos e o 2FA |

## Como rodar

```bash
npm run lint
npm test              # shared, API e front
npm run test:e2e      # sobe a API e o front sozinho
```

- Os testes da API precisam de `TEST_DATABASE_URI` apontando para um banco **terminado em `_test`** (eles apagam os
  dados). Cada arquivo usa o próprio banco.
- Os de ponta a ponta usam o banco `corewallet_e2e` (`E2E_DATABASE_URI` para trocar) e desligam o limite de
  tentativas com `RATE_LIMITS=off`. Antes, uma vez: `npx playwright install chromium`.
- Com Mongo autenticado, ponha usuário e senha na URI: `mongodb://USUARIO:SENHA@127.0.0.1:27017/corewallet_test?authSource=admin`.

## Imagens do README

As capturas de `docs/img` são geradas por um teste que só roda sob pedido, e as miniaturas saem delas:

```bash
E2E_SCREENSHOTS=1 npm run test:e2e -- tests/capturas.spec.js
e2e/miniaturas.sh        # precisa do cwebp (brew install webp)
```

O print do login com a verificação da Cloudflare usa as chaves de **teste** do Turnstile (veja `.env.example`): suba a API
com elas e o front em `:4173` (`npm run build -w web && npm run preview -w web -- --port 4173`) e rode
`node e2e/captura-turnstile.mjs`.
