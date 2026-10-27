# API

Todas as rotas ficam sob `/api` e respondem JSON. Rotas de dados exigem sessão aberta. Requisições que mudam
dados também repetem o cookie `cw_csrf` no cabeçalho `X-CSRF-Token` (veja [Segurança](SEGURANCA.md)).

## Conta e sessão

| Rota | O que faz |
|---|---|
| `POST /auth/signup` | Cria a conta |
| `POST /auth/signin` | Entra e abre a sessão (3 cookies: acesso, renovação e CSRF). Com 2FA ativo, devolve um desafio em vez da sessão |
| `POST /auth/signin/2fa` | Segunda etapa: o desafio recebido depois da senha e o código (do aplicativo ou de recuperação) |
| `POST /auth/refresh` | Troca o token de renovação por um novo e entrega um novo acesso |
| `POST /auth/logout` | Encerra esta sessão no servidor e apaga os cookies |
| `POST /auth/logout-all` | Encerra a conta em todos os dispositivos |
| `GET /auth/sessions` | Lista os dispositivos com sessão aberta |
| `DELETE /auth/sessions/:id` | Encerra uma sessão específica |
| `GET /auth/me` | Usuário logado |
| `GET /auth/challenge` | Desafio da verificação automática (só existe quando ela está ligada) |
| `GET /auth/config` | O que o front precisa saber antes do login: se há Google, qual captcha e se a confirmação de email está ligada |
| `GET /auth/google/nonce` · `POST /auth/google` | Login com Google: pede o nonce da tentativa e entrega o token do Google (`credential`) |
| `PATCH /auth/profile` | Tela "Complete seu perfil" de quem entrou pelo Google (só o nome) |

## Verificação em duas etapas e email

| Rota | O que faz |
|---|---|
| `GET /auth/2fa` | Estado do 2FA e quantos códigos de recuperação restam |
| `POST /auth/2fa/setup` | Começa a ativação (pede a senha) e devolve segredo e QR code |
| `POST /auth/2fa/enable` | Confirma com o primeiro código e devolve os códigos de recuperação |
| `POST /auth/2fa/disable` | Desativa (senha e código) |
| `POST /auth/email/verify` | Confirma o email pelo link |
| `POST /auth/email/resend` | Pede um novo link (a resposta é sempre a mesma, exista a conta ou não) |

## Lançamentos

| Rota | O que faz |
|---|---|
| `GET /transactions?month=2026-10` | Lançamentos do mês (mais novos primeiro), saldo geral, totais de **hoje** (`today`, dia do servidor em Brasília) e resumo do mês por categoria |
| `POST /transactions` | Cria receita (`input`) ou despesa (`output`), com categoria |
| `GET /transactions/:id` | Um lançamento do próprio usuário |
| `PUT /transactions/:id` | Edita valor, descrição e categoria (tipo e data não mudam) e grava o que mudou no histórico |
| `DELETE /transactions/:id` | Exclui (suave): sai da lista e dos totais, continua no histórico |
| `POST /transactions/:id/restore` | Restaura um excluído |
| `POST /transactions/:id/archive` | Arquiva: sai da lista, continua contando no saldo, nos totais e na análise |
| `POST /transactions/:id/unarchive` | Desarquiva |
| `GET /transactions/:id/history` | Eventos de um lançamento (criado, editado, arquivado, desarquivado, excluído, restaurado) |
| `GET /transactions/activity` | Registro geral (últimos 100 eventos) e listas de excluídos e arquivados (até 200 cada, com aviso de corte) |
| `GET /transactions/search` | Extrato: `q`, `type`, `category`, `status` (`all`, `active`, `archived`, `deleted`), `from` e `to` (AAAA-MM-DD, em Brasília), `limit` (até 100) e `cursor`. Devolve também os totais do filtro inteiro |

## Categorias e análise

| Rota | O que faz |
|---|---|
| `GET /categories` | Categorias criadas pela pessoa (as padrão vêm do pacote `shared`) |
| `POST /categories` | Cria uma categoria, ou devolve a que já existe com o mesmo nome |
| `GET /categories/usage` | Quantos lançamentos usam cada categoria |
| `PATCH /categories/:id` | Renomeia (os lançamentos acompanham, pois guardam o id) |
| `DELETE /categories/:id?moveTo=` | Apaga; havendo lançamentos, `moveTo` diz para qual categoria do mesmo tipo eles vão |
| `GET /analysis?months=3\|6\|12` | Série por mês, saldo inicial, categorias com o período anterior e maiores despesas |

## Outros

| Rota | O que faz |
|---|---|
| `GET /health` | Saúde da API e do banco |

Nas respostas, `value` vem em centavos inteiros. Erros de validação vêm com `errors` por campo; erros do servidor,
sempre com uma frase genérica.
