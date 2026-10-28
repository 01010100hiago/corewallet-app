# Configuração

Tudo se configura pelo `.env` (copie de [`.env.example`](../.env.example); ele nunca vai para o Git). A API
**não sobe** se uma variável obrigatória faltar ou tiver valor inválido.

## Variáveis

| Variável | Para quê | Padrão |
|---|---|---|
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD` | Usuário e senha que o `docker compose` cria no Mongo (senha só com letras e números) | obrigatórias |
| `DATABASE_URI` | Endereço do Mongo. No compose já vem pronto; só é preciso ao rodar a API fora do Docker | obrigatória |
| `JWT_SECRET` | Chave dos tokens de acesso. Mínimo de 32 caracteres (`openssl rand -hex 48`) | obrigatória |
| `WEB_ORIGIN` | Endereço do site (usado na checagem de origem e nos links de email) | obrigatória; no compose, `http://localhost:8080` |
| `PORT` | Porta da API | `4000` |
| `COOKIE_SECURE` | `true` ao servir por HTTPS (cookies só trafegam por HTTPS) | `false` no compose; `true` se a API rodar sozinha em produção |
| `TRUST_PROXY` | Quantos proxies ficam entre o navegador e a API (veja abaixo) | `0` na API, `1` no compose |
| `GOOGLE_CLIENT_ID` | Liga o botão "Entrar com o Google" | vazio = desligado |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Captcha da Cloudflare (as duas juntas ou nenhuma) | vazio = usa a verificação automática |
| `CAPTCHA_POW`, `POW_MAX_NUMBER` | `off` desliga a verificação automática; `POW_MAX_NUMBER` ajusta a dificuldade (100 a 5.000.000) | ligada, `100000` |
| `SMTP_URL`, `MAIL_FROM` | Envio de email; os dois juntos ligam a confirmação de email | vazio = desligada |
| `EMAIL_VERIFICATION` | `off` envia os emails mas não exige a confirmação para entrar | exige quando há SMTP |
| `TOTP_ENCRYPTION_KEY` | Chave que cifra os segredos do 2FA (32+ caracteres, `openssl rand -hex 32`) | derivada do `JWT_SECRET` |
| `WEB_PORT`, `MONGO_PORT` | Portas no computador (só `127.0.0.1`), se as padrão (`8080`, `27017`) estiverem ocupadas | `8080`, `27017` |

Só para desenvolvimento e testes, e **recusadas em produção**: `RATE_LIMITS=off`, `MAIL_OUTBOX_FILE` e as
chaves de teste da Cloudflare.

### `TRUST_PROXY`

É o número de proxies entre o navegador e a API. A API usa isso para descobrir o IP de cada pessoa, e os limites
de tentativa dependem dele. Valor **menor** que o real faz todo mundo dividir o mesmo IP (dá para travar o login
dos outros); valor **maior** deixa o IP ser falsificado.

- Só o nginx do próprio `docker-compose.yml` na frente: `1`.
- Túnel da Cloudflare na frente do nginx (navegador, Cloudflare, cloudflared, nginx, API): `2`.

## Login com Google

Usa o botão oficial (Google Identity Services). A API só precisa do **ID do cliente**, que não é segredo.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e vá em **APIs e serviços →
   Tela de consentimento OAuth**. Tipo "Externo", nome do app, email de suporte.
2. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas** coloque `http://localhost:8080` (Docker), `http://localhost:5173`
   (se rodar com `npm run dev:web`) e o domínio de produção. Não precisa de URI de redirecionamento.
4. Copie o ID (termina em `.apps.googleusercontent.com`) para `GOOGLE_CLIENT_ID` e rode `docker compose up -d`.

Como funciona:

- A API confere assinatura, emissor, validade e **se o token foi emitido para este app**, e exige email verificado.
- Cada tentativa leva um **nonce** amarrado a um cookie `httpOnly`: quem rouba um token do Google não consegue
  montar o cookie que o gera. A tentativa vale 5 minutos e uma vez.
- **Contas não são juntadas sozinhas.** Se o email já tem conta com senha, o login com Google é recusado. Juntar
  automaticamente deixaria quem cadastrou o email de outra pessoa virar dono da conta depois do login dela.
- Quem entra pelo Google pela primeira vez completa só o nome. Não guardamos senha, telefone nem documento.

## Verificação anti-robô

Cadastro e login com senha exigem uma verificação, em uma de duas formas. O Turnstile tem prioridade quando as
chaves existem.

**Verificação automática (padrão, sem chave nenhuma).** O navegador resolve sozinho, em segundos, um pequeno
desafio de cálculo (prova de trabalho, no estilo ALTCHA) enquanto a pessoa preenche o formulário. O servidor assina
cada desafio, confere a assinatura e o prazo de 5 minutos e só aceita cada um uma vez. Ela **encarece** o abuso em
massa, mas não distingue pessoa de robô como um captcha com análise de comportamento.

**Turnstile (Cloudflare).** Gratuito e sem semáforos para clicar.

1. No painel da Cloudflare: **Turnstile → Add widget**. Em **Hostname**, `localhost` e o domínio de produção. Modo **Managed**.
2. Copie a **Site Key** para `TURNSTILE_SITE_KEY` e a **Secret Key** para `TURNSTILE_SECRET_KEY`.
3. Rode `docker compose up -d`.

Para testar sem criar nada, o `.env.example` traz as chaves públicas de teste da Cloudflare (o captcha sempre
passa). A API as recusa em produção. Se a Cloudflare não responder, o login **falha fechado** (503).

## Confirmação de email

Sem configuração, o cadastro não envia email e não exige confirmação. Para ligar, é preciso um **provedor de
SMTP**: os grandes provedores bloqueiam como spam o que sai de IP residencial, então montar um servidor próprio
não vale a pena. Opções com plano gratuito: Brevo, Resend, ou Gmail com uma *senha de app*. Crie a conta, verifique
o domínio ou o remetente lá e preencha:

```ini
SMTP_URL=smtps://usuario:senha@smtp.seuprovedor.com:465
MAIL_FROM=CoreWallet <nao-responda@seudominio.com>
```

- O cadastro por senha passa a enviar um link de uso único, válido por 24 horas, e o login só abre depois da confirmação.
- Com a confirmação **desligada** (sem SMTP, ou `EMAIL_VERIFICATION=off`), o cadastro já nasce ativo e entra direto;
  essas contas continuam entrando depois que você ligar a confirmação. Só as criadas por versões antigas ficam como
  "não confirmadas" e deixariam de entrar; antes de ligar, marque-as:

  ```bash
  docker compose exec mongo mongosh -u USUARIO -p SENHA --authenticationDatabase admin corewallet \
    --eval 'db.users.updateMany({provider:"password"},{$set:{emailVerified:true}})'
  ```

- **O link não confirma sozinho: a página pede a senha da conta.** Quem cadastra o email de outra pessoa escolhe a
  senha, então a vítima, mesmo clicando no link que recebeu, não a conhece e não consegue ativar a conta do invasor.
- Quem cadastra um email que outra pessoa "reservou" sem nunca confirmar assume a conta (só contas criadas com a
  confirmação ligada e nunca confirmadas; as antigas, mesmo que recebam um link, não podem ser assumidas), então
  ninguém bloqueia o email dos outros.
- Cada link aceita 5 senhas erradas; depois morre e é preciso pedir outro (a tela de login oferece).
- Contas pendentes de **antes** desta regra (sem o marcador `pendingSignup`) não podem ser assumidas por um novo
  cadastro. Se existirem, apague-as à mão (`db.users.deleteMany({provider:"password", emailVerified:{$ne:true}})`,
  só as que nunca entraram) e, ao **desligar** a exigência de confirmação, apague também as pendentes em vez de
  marcá-las como confirmadas.
- A senha do SMTP é segredo: só no `.env` do servidor, nunca no repositório.

## Verificação em duas etapas

Não precisa de serviço externo: o aplicativo autenticador do celular e a API calculam o código com a mesma conta
(RFC 6238) e o mesmo segredo, que fica cifrado no banco (AES-256-GCM).

- Defina `TOTP_ENCRYPTION_KEY` **antes** de alguém ativar o 2FA. Sem ela a chave vem do `JWT_SECRET`, e trocar o
  `JWT_SECRET` invalidaria os 2FA já ativos (essas pessoas passariam a depender dos códigos de recuperação).
- **Perder a `TOTP_ENCRYPTION_KEY` tem o mesmo efeito.** Guarde-a no cofre de senhas.
- Ativar pede a senha e desconecta as outras sessões. A pessoa recebe 10 códigos de recuperação, mostrados uma só
  vez e guardados só em hash.
- Cada código vale uma vez. O desafio da segunda etapa morre depois de 5 erros, e 10 erros seguidos travam a conta
  por 15 minutos, de qualquer IP.
- Contas que entram pelo Google usam o 2FA do próprio Google.
