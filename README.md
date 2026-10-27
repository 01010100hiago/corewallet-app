<img src="web/public/logo-mark.svg" alt="" width="64" height="64" />

# CoreWallet

Carteira de entradas e saídas, inspirada no projeto do curso de React da [DIO](https://www.dio.me/) ([SPA original](https://github.com/codethi/diowallet-spa) · [API original](https://github.com/codethi/diowallet-api)), com front e API no mesmo repositório e melhorias de segurança.

> Em construção. Fase atual: **3 — lançamentos completos** (categorias, editar, excluir, filtro por mês e gráfico), sobre a sessão reforçada da Fase 2 e as telas da Fase 1.

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

## Login com Google

Usa o botão oficial do Google (Google Identity Services). A API só precisa do **ID do cliente**, que não é segredo.

1. Abra o [Google Cloud Console](https://console.cloud.google.com/), crie (ou escolha) um projeto e vá em **APIs e serviços → Tela de consentimento OAuth**. Tipo "Externo", nome do app CoreWallet, e-mail de suporte.
2. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas** coloque `http://localhost:8080` (Docker) e `http://localhost:5173` (se rodar com `npm run dev:web`), e `https://carteira.exemplo.com` quando publicar. Não precisa de URI de redirecionamento.
4. Copie o ID (termina em `.apps.googleusercontent.com`) para `GOOGLE_CLIENT_ID` no `.env` e rode `docker compose up -d`.

Como funciona, e por quê:

- A API confere o token do Google (assinatura, emissor, validade e **se foi emitido para este app**) e exige **email verificado**.
- Cada tentativa leva um **nonce**. A API guarda num cookie `httpOnly` um segredo da tentativa e entrega ao navegador só um HMAC dele, feito com a chave da API. O token do Google só vale se o nonce combinar com o cookie. Quem rouba um token lê o nonce, mas não consegue montar o cookie que o gera. A tentativa vale 5 minutos e uma vez; a tela renova o nonce sozinha.
- **Não juntamos contas sozinhos.** Se o email já tem conta com senha, o login com Google é recusado com uma mensagem. O email de um cadastro com senha nunca foi verificado, então juntar automaticamente permitiria que alguém que cadastrou o email de outra pessoa ficasse dono da conta depois do login dela.
- Quem entra pelo Google pela primeira vez passa pela tela **Complete seu perfil** (só o nome). Não guardamos senha, telefone nem documento.

## Captcha da Cloudflare (Turnstile)

Protege o **cadastro e o login com senha**. É gratuito e não pede para clicar em semáforos.

1. No painel da Cloudflare: **Turnstile → Add widget**. Em **Hostname** coloque `localhost` e o domínio de produção. Modo **Managed**.
2. Copie a **Site Key** para `TURNSTILE_SITE_KEY` e a **Secret Key** para `TURNSTILE_SECRET_KEY` no `.env`.
3. Rode `docker compose up -d`.

Para testar sem criar nada, o `.env.example` traz as chaves públicas de teste da Cloudflare (o captcha sempre passa). A API **recusa essas chaves em produção**, para ninguém publicar com o captcha de mentira.

A API confere o token com a Cloudflare a cada cadastro e login. Se a Cloudflare não responder, o login **falha fechado** (503) em vez de deixar passar sem verificar.

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
| `POST /api/auth/signin` | Entra e abre uma sessão (3 cookies: acesso, renovação e CSRF) |
| `POST /api/auth/refresh` | Troca o token de renovação por um novo e entrega um novo acesso |
| `POST /api/auth/logout` | Encerra esta sessão no servidor e apaga os cookies |
| `POST /api/auth/logout-all` | Encerra a conta em todos os aparelhos |
| `GET /api/auth/sessions` | Lista os aparelhos com sessão aberta |
| `DELETE /api/auth/sessions/:id` | Encerra uma sessão específica |
| `GET /api/auth/me` | Usuário logado |
| `GET /api/transactions?month=2026-10` | Lançamentos (mais novos primeiro), saldo geral e, com `month`, o resumo do mês por categoria |
| `POST /api/transactions` | Cria entrada ou saída, com categoria |
| `GET /api/transactions/:id` | Um lançamento do próprio usuário |
| `PUT /api/transactions/:id` | Edita valor, descrição e categoria (o tipo e a data não mudam) |
| `DELETE /api/transactions/:id` | Exclui um lançamento do próprio usuário |

## Melhorias em relação ao curso

A lista completa entra conforme cada fase fica pronta.

- **Sessão em cookie `httpOnly`**: o token nunca fica visível para o JavaScript da página, ao contrário do `js-cookie` do curso. Logout apaga a sessão no servidor, não só o cookie.
- **Acesso curto + renovação rotativa:** o token de acesso dura 15 minutos. A sessão (até 30 dias) é renovada por um token opaco que **troca a cada uso**; o banco guarda só o hash dele. Se um token já trocado reaparecer depois de 10 segundos, ele foi copiado e a sessão inteira é encerrada. Duas abas renovando juntas são tratadas como corrida normal, sem derrubar ninguém.
- **Aparelhos conectados:** a conta mostra cada sessão (navegador, sistema, começo do IP e último uso) e deixa encerrar uma ou todas. Encerrar derruba o acesso na hora: o token de acesso só vale enquanto a sessão dele existir.
- **CSRF em duas camadas:** a `Origin` precisa ser a do próprio site, e requisições que mudam dados com sessão aberta repetem o cookie `cw_csrf` no cabeçalho `X-CSRF-Token` (double submit). O cookie de renovação é `SameSite=Strict`.
- **Limite de tentativas** (`express-rate-limit`): por IP em login, cadastro, Google e renovação; no login também por IP + email, contando só os erros, então o dono da conta que acerta a senha não gasta o limite. Fica na memória da API: serve para uma instância; com várias, troque por Redis.
- **Validação nos dois lados com o mesmo código:** os schemas Zod ficam em `shared/` e a API valida tudo de novo. Objetos no lugar de texto (NoSQL injection) são recusados.
- **Cada usuário só vê os próprios lançamentos**, e `userId` e `createdAt` nunca vêm do cliente.
- **Login sem vazar quais emails existem:** mesma resposta e mesmo tempo para email errado e senha errada.
- **Senha:** bcrypt custo 12, mínimo de 8 caracteres, máximo de 72 *bytes* (o limite real do bcrypt) e lista de senhas comuns recusadas. O medidor da tela usa as mesmas regras da API.
- **Sessão transparente:** o selo "Sessão protegida" mostra quando a sessão começou, quando vence (pela hora do servidor, não do aparelho) e se a conexão é HTTPS. A sessão é renovada sozinha antes de o acesso vencer; se a renovação for recusada, a tela volta ao login e avisa o motivo.
- **Texto honesto:** a interface só afirma o que o código faz de verdade. Exportar dados e excluir a conta ainda não existem, e a tela diz isso.
- **Respostas da API com `Cache-Control: no-store`**, para dados da pessoa logada não ficarem em cache.
- **Acessibilidade:** rótulos visíveis, foco que vai para o título a cada troca de página, anel de foco legível em fundo claro e escuro, regras da senha lidas por leitor de tela, título de aba por tela.
- **Categorias que combinam com o tipo:** "Salário" não existe numa saída. A regra fica no pacote `shared`, e a API a aplica na criação e na edição. Lançamentos antigos, sem categoria, contam como "Outros".
- **Editar e excluir só o que é seu:** id de outra pessoa responde 404, igual a "não existe". Excluir pede confirmação na linha e só tira o item da tela depois que a API confirma; o foco do teclado acompanha a confirmação.
- **Mês e gráfico calculados no banco:** a tela mostra um mês por vez (`?mes=2026-10` na URL), com entradas, saídas e "Para onde foi o dinheiro" (saídas por categoria). O saldo continua sendo o de todos os lançamentos.
- **Dinheiro em centavos inteiros**, sem erro de ponto flutuante; saldo calculado no banco.

- Front e API no mesmo domínio: o nginx serve o front e encaminha `/api` para a API.
- Cabeçalhos de segurança no nginx (CSP, `X-Frame-Options`, `nosniff`) e na API (`helmet`).
- A API para na hora se faltar alguma variável de ambiente, em vez de subir quebrada.
- Mongo com usuário e senha, acessível só pela máquina local.
- CI no GitHub Actions com lint, testes, `npm audit` e build das imagens; Dependabot semanal.

## Limites conhecidos

- O cadastro avisa quando o email já existe (409). Esconder isso exige verificar o email, que ainda não existe; o limite de cadastros por IP reduz o abuso.
- O limite de tentativas por conta pode ser usado para travar o login de alguém por alguns minutos (de um IP só, com o email da pessoa). A chave IP + email limita isso a quem está no mesmo IP.
- A lista de aparelhos guarda e mostra o IP pela metade e o navegador/sistema lidos do `User-Agent`, uma leitura aproximada.

- Os meses (e o dia e a hora mostrados em cada lançamento) seguem o horário de Brasília, UTC-3 fixo, igual em qualquer aparelho. Quem usa de outro fuso vê as datas em Brasília.
- A data de um lançamento é a da criação e não pode ser editada; trocar o tipo (entrada/saída) exige excluir e criar de novo.
- Cada mês mostra no máximo 500 lançamentos; acima disso a tela avisa e os totais continuam corretos.

## Licença

MIT
