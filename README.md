<img src="web/public/logo-mark.svg" alt="" width="64" height="64" />

# CoreWallet

Carteira de receitas e despesas, inspirada no projeto do curso de React da [DIO](https://www.dio.me/) ([SPA original](https://github.com/codethi/diowallet-spa) · [API original](https://github.com/codethi/diowallet-api)), com front e API no mesmo repositório e melhorias de segurança.

<p>
  <img src="docs/img/inicio.png" alt="Tela inicial do CoreWallet: saldo integrado à barra do topo, resumo do mês, despesas por categoria em anel e lista de lançamentos" width="49%" />
  <img src="docs/img/inicio-celular.png" alt="A mesma tela no celular" width="22%" />
</p>
<p>
  <img src="docs/img/analise.png" alt="Análise financeira: indicadores do período, receitas e despesas por mês, evolução do saldo, categorias com variação e maiores despesas" width="36%" />
  <img src="docs/img/historico.png" alt="Histórico de alterações: arquivados, excluídos com Restaurar e o registro de eventos" width="36%" />
</p>
<p>
  <img src="docs/img/conta.png" alt="Minha conta: dispositivos conectados e o que o sistema guarda" width="36%" />
  <img src="docs/img/nova-saida.png" alt="Formulário de nova despesa, com categoria" width="36%" />
</p>

## O que tem

- **Lançamentos:** receitas e despesas com categoria (as padrão ou as que você cria na hora), editar, excluir (com confirmação e "Desfazer"), **arquivar**, resumo do mês e despesas por categoria em anel.
- **Análise financeira:** receitas, despesas, resultado, taxa de poupança e despesa média; receitas e despesas por mês; evolução do saldo; mês atual comparado ao anterior; categorias com variação sobre o período anterior; maiores despesas. Períodos de 3, 6 ou 12 meses, com tabela de valores para cada gráfico.
- **Histórico de alterações:** tudo o que é criado, editado, arquivado, excluído ou restaurado fica registrado. O que foi **excluído** sai da lista e do saldo, mas pode ser restaurado; o que foi **arquivado** sai da lista, mas continua contando no saldo, e pode ser desarquivado.
- **Entrar:** email e senha (com captcha da Cloudflare) ou conta Google, sem junção automática de contas.
- **Sessão segura:** acesso de 15 minutos renovado sozinho, dispositivos conectados que dá para encerrar, proteção CSRF e limite de tentativas.
- **Transparência:** o selo "Sessão protegida" e a tela "Minha conta" mostram só o que o código faz de verdade.

Pronto para publicar: veja [docs/DEPLOY.md](docs/DEPLOY.md).

## Stack

**Linguagem: JavaScript** (sem TypeScript), como no curso. É por isso que o GitHub mostra "JavaScript" nas linguagens do repositório: ele conta pela extensão dos arquivos, e os `.jsx` do React são JavaScript. **React** é a biblioteca de interface (veja os tópicos do repositório), não uma linguagem.

As mesmas bibliotecas do curso, em versões atuais:

- **Front (`web/`):** React, Vite (SWC), TailwindCSS, React Router Dom, React Hook Form, Zod, Axios, dayjs, js-cookie. Os ícones, a marca e a ilustração são desenhados para o projeto (nada de biblioteca de ícones).
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
| `npm run test:e2e` | Testes de ponta a ponta no Chromium (Playwright); sobem a API e o front sozinhos. Antes, uma vez: `npx playwright install chromium` |
| `npm run build` | Build de produção do front |

## Testes

Quatro camadas, todas no CI do GitHub:

- **`shared/`** (`node --test`): schemas, dinheiro, senha, categorias e meses.
- **API** (`node --test` + Supertest, contra um Mongo de verdade): autenticação, sessões e renovação, CSRF, limite de tentativas, lançamentos, filtro por mês, histórico, exclusão e arquivamento, categorias e análise financeira. Cada arquivo usa o próprio banco `*_test`.
- **Front** (Vitest + Testing Library): telas, sessão, renovação automática, cálculos da análise e acessibilidade.
- **Ponta a ponta** (`e2e/`, Playwright): a jornada inteira no navegador (inclusive arquivar, restaurar e a análise, também no celular), mais a renovação silenciosa da sessão, o CSRF, a lista de dispositivos e o "encerrar todas as sessões". Usa o banco `corewallet_e2e` (`E2E_DATABASE_URI` para trocar) e desliga o limite de tentativas com `RATE_LIMITS=off`, que a API **recusa em produção**.

As imagens deste README são geradas por `E2E_SCREENSHOTS=1 npm run test:e2e -- tests/capturas.spec.js`.

## API

| Rota | O que faz |
|---|---|
| `POST /api/auth/signup` | Cria a conta |
| `POST /api/auth/signin` | Entra e abre uma sessão (3 cookies: acesso, renovação e CSRF) |
| `POST /api/auth/refresh` | Troca o token de renovação por um novo e entrega um novo acesso |
| `POST /api/auth/logout` | Encerra esta sessão no servidor e apaga os cookies |
| `POST /api/auth/logout-all` | Encerra a conta em todos os dispositivos |
| `GET /api/auth/sessions` | Lista os dispositivos com sessão aberta |
| `DELETE /api/auth/sessions/:id` | Encerra uma sessão específica |
| `GET /api/auth/me` | Usuário logado |
| `GET /api/transactions?month=2026-10` | Lançamentos (mais novos primeiro), saldo geral e, com `month`, o resumo do mês por categoria |
| `POST /api/transactions` | Cria receita (`input`) ou despesa (`output`), com categoria |
| `GET /api/transactions/:id` | Um lançamento do próprio usuário |
| `PUT /api/transactions/:id` | Edita valor, descrição e categoria (o tipo e a data não mudam); grava o que mudou no histórico |
| `DELETE /api/transactions/:id` | Exclui (suave): o lançamento sai da lista e dos totais, mas continua no histórico |
| `POST /api/transactions/:id/restore` | Restaura um lançamento excluído |
| `GET /api/transactions/:id/history` | Eventos de um lançamento (criado, editado, arquivado, desarquivado, excluído, restaurado) |
| `POST /api/transactions/:id/archive` | Arquiva: sai da lista, continua contando no saldo, nos totais e no gráfico |
| `POST /api/transactions/:id/unarchive` | Desarquiva |
| `GET /api/transactions/activity` | Registro geral (últimos 100 eventos) e as listas de excluídos e arquivados (até 200 cada, com aviso de corte) |
| `GET /api/analysis?months=3\|6\|12` | Análise financeira: série por mês, saldo inicial, categorias com o período anterior, maiores despesas |
| `GET /api/categories` | Categorias criadas pela pessoa (as padrão vêm do pacote `shared`) |
| `POST /api/categories` | Cria uma categoria (ou devolve a que já existe com o mesmo nome) |

## Melhorias em relação ao curso

A lista completa entra conforme cada fase fica pronta.

- **Sessão em cookie `httpOnly`**: o token nunca fica visível para o JavaScript da página, ao contrário do `js-cookie` do curso. Logout apaga a sessão no servidor, não só o cookie.
- **Acesso curto + renovação rotativa:** o token de acesso dura 15 minutos. A sessão (até 30 dias) é renovada por um token opaco que **troca a cada uso**; o banco guarda só o hash dele. Se um token já trocado reaparecer depois de 10 segundos, ele foi copiado e a sessão inteira é encerrada. Duas abas renovando juntas são tratadas como corrida normal, sem derrubar ninguém.
- **Dispositivos conectados:** a conta mostra cada sessão (navegador, sistema, começo do IP e último uso) e deixa encerrar uma ou todas. Encerrar derruba o acesso na hora: o token de acesso só vale enquanto a sessão dele existir.
- **CSRF em duas camadas:** a `Origin` precisa ser a do próprio site, e requisições que mudam dados com sessão aberta repetem o cookie `cw_csrf` no cabeçalho `X-CSRF-Token` (double submit). O cookie de renovação é `SameSite=Strict`.
- **Limite de tentativas** (`express-rate-limit`): por IP em login, cadastro, Google e renovação; no login também por IP + email, contando só os erros, então o dono da conta que acerta a senha não gasta o limite. Fica na memória da API: serve para uma instância; com várias, troque por Redis.
- **Validação nos dois lados com o mesmo código:** os schemas Zod ficam em `shared/` e a API valida tudo de novo. Objetos no lugar de texto (NoSQL injection) são recusados.
- **Cada usuário só vê os próprios lançamentos**, e `userId` e `createdAt` nunca vêm do cliente.
- **Login sem vazar quais emails existem:** mesma resposta e mesmo tempo para email errado e senha errada.
- **Senha:** bcrypt custo 12, mínimo de 8 caracteres, máximo de 72 *bytes* (o limite real do bcrypt) e lista de senhas comuns recusadas. O medidor da tela usa as mesmas regras da API.
- **Sessão transparente:** o selo "Sessão protegida" mostra quando a sessão começou, quando vence (pela hora do servidor, não do dispositivo) e se a conexão é HTTPS. A sessão é renovada sozinha antes de o acesso vencer; se a renovação for recusada, a tela volta ao login e avisa o motivo.
- **Texto honesto:** a interface só afirma o que o código faz de verdade. Exportar dados e excluir a conta ainda não existem, e a tela diz isso.
- **Respostas da API com `Cache-Control: no-store`**, para dados da pessoa logada não ficarem em cache.
- **Acessibilidade:** rótulos visíveis, foco que vai para o título a cada troca de página, anel de foco legível em fundo claro e escuro, regras da senha lidas por leitor de tela, título de aba por tela.
- **Categorias que combinam com o tipo:** "Salário" não existe numa despesa. A regra fica no pacote `shared`, e a API a aplica na criação e na edição. Lançamentos antigos, sem categoria, contam como "Outras receitas" ou "Outras despesas".
- **Editar e excluir só o que é seu:** id de outra pessoa responde 404, igual a "não existe". Excluir pede confirmação na linha e só tira o item da tela depois que a API confirma; o foco do teclado acompanha a confirmação.
- **Exclusão suave e histórico:** excluir marca o lançamento (`deletedAt`) em vez de apagá-lo. Ele sai da lista, do saldo e do gráfico, mas fica em "Excluídos" na página Histórico de alterações, de onde pode ser restaurado, e cada criação, edição (com "de → para"), exclusão e restauração vira um evento que só cresce (não existe rota para alterar ou apagar eventos). Editar e excluir ao mesmo tempo é seguro: a gravação só vale se o lançamento ainda estiver como foi lido, então o histórico sempre encadeia.
- **Arquivar:** o lançamento arquivado sai da lista, mas continua valendo (saldo, totais, gráfico e análise). O mês avisa quantos arquivados entram nas contas e leva a eles. Arquivado não se edita nem se exclui sem desarquivar (a API responde 409, inclusive se o arquivamento acontecer no meio de uma edição).
- **Análise financeira calculada no banco:** meses no horário de Brasília, saldo inicial do período, período anterior do mesmo tamanho para comparar, e todos os meses da série (com zero onde não houve lançamento). Variações usam o valor absoluto da base, então sair de um resultado negativo para positivo aparece como melhora. Gráficos em SVG feitos à mão, sem biblioteca, cada um com uma tabela acessível.
- **Categorias suas:** na hora do lançamento dá para criar uma categoria nova. Nome de 2 a 30 caracteres, sem repetir (maiúscula e acento não contam), até 30 por tipo, limite garantido por uma reserva atômica mesmo com criações simultâneas. Cada categoria só vale para o seu dono e para o tipo certo.
- **Mês e gráfico calculados no banco:** a tela mostra um mês por vez (`?mes=2026-10` na URL), com receitas, despesas e "Despesas por categoria" (anel com as despesas do mês). O saldo continua sendo o de todos os lançamentos.
- **Dinheiro em centavos inteiros**, sem erro de ponto flutuante; saldo calculado no banco.

- Front e API no mesmo domínio: o nginx serve o front e encaminha `/api` para a API.
- Cabeçalhos de segurança no nginx (CSP, `X-Frame-Options`, `nosniff`) e na API (`helmet`).
- A API para na hora se faltar alguma variável de ambiente, em vez de subir quebrada.
- Mongo com usuário e senha, acessível só pela máquina local.
- CI no GitHub Actions com lint, testes, `npm audit` e build das imagens; Dependabot semanal.

## Limites conhecidos

- O cadastro avisa quando o email já existe (409). Esconder isso exige verificar o email, que ainda não existe; o limite de cadastros por IP reduz o abuso.
- O limite de tentativas por conta pode ser usado para travar o login de alguém por alguns minutos (de um IP só, com o email da pessoa). A chave IP + email limita isso a quem está no mesmo IP.
- A lista de dispositivos guarda e mostra o IP pela metade e o navegador/sistema lidos do `User-Agent`, uma leitura aproximada.

- Os meses (e o dia e a hora mostrados em cada lançamento) seguem o horário de Brasília, UTC-3 fixo, igual em qualquer dispositivo. Quem usa de outro fuso vê as datas em Brasília.
- A data de um lançamento é a da criação e não pode ser editada; trocar o tipo (receita/despesa) exige excluir e criar de novo.
- Cada mês mostra no máximo 500 lançamentos; acima disso a tela avisa e os totais continuam corretos.
- O registro de alterações mostra os 100 eventos mais recentes, e as listas de excluídos e de arquivados mostram até 200 cada. A tela avisa quando há mais; restaurar ou desarquivar traz os mais antigos para a lista.
- Lançamentos criados antes do histórico existir não têm o evento "criado"; a tela diz isso e mostra só as alterações novas.
- O histórico é gravado logo depois da alteração, sem transação do banco: se o servidor cair entre as duas gravações, a alteração vale e o último evento pode faltar.
- Categorias próprias ainda não podem ser renomeadas nem apagadas.
- Na análise, o mês atual ainda está em andamento (a tela avisa), então a despesa média e a comparação com o mês anterior o incluem pela metade.
- A análise cobre no máximo 12 meses.

## Licença

MIT
