<img src="web/public/logo-mark.svg" alt="" width="64" height="64" />

# CoreWallet

Carteira de entradas e saídas, inspirada no projeto do curso de React da [DIO](https://www.dio.me/) ([SPA original](https://github.com/codethi/diowallet-spa) · [API original](https://github.com/codethi/diowallet-api)), com front e API no mesmo repositório e melhorias de segurança.

> Em construção. Fase atual: **1 — telas e fluxo básico** (cadastro, login, lançamentos e saldo), já com o visual novo e a UX de segurança. A Fase 2 reforça a sessão (refresh token, CSRF, rate limit).

## Stack

As mesmas bibliotecas do curso, em versões atuais:

- **Front (`web/`):** React, Vite (SWC), TailwindCSS, React Router Dom, React Hook Form, Zod, Axios, React Icons, dayjs, js-cookie
- **API (`api/`):** Node, Express, MongoDB (Mongoose), bcrypt, jsonwebtoken, helmet
- **Compartilhado (`shared/`):** schemas Zod usados pelo front e pela API

## Como rodar

Precisa de Node 24 (`nvm use`) e Docker.

```bash
cp .env.example .env      # troque as senhas e o JWT_SECRET
npm install
```

**Tudo no Docker** (como em produção), em http://localhost:8080:

```bash
docker compose up -d --build
```

**Desenvolvimento** (Mongo no Docker, API e front no Mac com recarga automática), em http://localhost:5173:

```bash
docker compose up -d mongo
npm run dev:api
npm run dev:web
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint no front e na API |
| `npm test` | Testes de `shared`, da API (`node --test` + Supertest, precisam de `TEST_DATABASE_URI`) e do front (Vitest) |
| `npm run build` | Build de produção do front |

## API

| Rota | O que faz |
|---|---|
| `POST /api/auth/signup` | Cria a conta |
| `POST /api/auth/signin` | Entra e define o cookie de sessão |
| `POST /api/auth/logout` | Apaga o cookie |
| `GET /api/auth/me` | Usuário logado |
| `GET /api/transactions` | Lançamentos do usuário (mais novos primeiro) e o saldo de todos |
| `POST /api/transactions` | Cria entrada ou saída |

## Melhorias em relação ao curso

A lista completa entra conforme cada fase fica pronta.

- **Sessão em cookie `httpOnly`** (`SameSite=Lax`): o token nunca fica visível para o JavaScript da página, ao contrário do `js-cookie` do curso. Logout apaga o cookie de verdade.
- **Validação nos dois lados com o mesmo código:** os schemas Zod ficam em `shared/` e a API valida tudo de novo. Objetos no lugar de texto (NoSQL injection) são recusados.
- **Cada usuário só vê os próprios lançamentos**, e `userId` e `createdAt` nunca vêm do cliente.
- **Login sem vazar quais emails existem:** mesma resposta e mesmo tempo para email errado e senha errada.
- **Senha:** bcrypt custo 12, mínimo de 8 caracteres, máximo de 72 *bytes* (o limite real do bcrypt) e lista de senhas comuns recusadas. O medidor da tela usa as mesmas regras da API.
- **Sessão transparente:** o selo "Sessão protegida" mostra quando a sessão começou, quando vence (pela hora do servidor, não do aparelho) e se a conexão é HTTPS. A tela volta ao login sozinha quando a sessão vence e avisa o motivo.
- **Texto honesto:** a interface só afirma o que o código faz de verdade. Recursos da Fase 2 (renovar sessão, lista de aparelhos, "sair de todos") não aparecem até existirem.
- **Respostas da API com `Cache-Control: no-store`**, para dados da pessoa logada não ficarem em cache.
- **Acessibilidade:** rótulos visíveis, foco que vai para o título a cada troca de página, anel de foco legível em fundo claro e escuro, regras da senha lidas por leitor de tela, título de aba por tela.
- **Dinheiro em centavos inteiros**, sem erro de ponto flutuante; saldo calculado no banco.

- Front e API no mesmo domínio: o nginx serve o front e encaminha `/api` para a API.
- Cabeçalhos de segurança no nginx (CSP, `X-Frame-Options`, `nosniff`) e na API (`helmet`).
- A API para na hora se faltar alguma variável de ambiente, em vez de subir quebrada.
- Mongo com usuário e senha, acessível só pela máquina local.
- CI no GitHub Actions com lint, testes, `npm audit` e build das imagens; Dependabot semanal.

## Licença

MIT
