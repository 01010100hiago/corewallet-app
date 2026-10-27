# Publicar o CoreWallet (servidor Debian com Docker + túnel da Cloudflare)

Desenho: o navegador chega pela Cloudflare (HTTPS), o `cloudflared` do servidor entrega em
`http://localhost:8080` (nginx do CoreWallet), o nginx serve o front e encaminha `/api` para a
API, e a API fala com o Mongo na rede interna do Docker. Nada além do `127.0.0.1:8080` fica
exposto na máquina, e o Mongo não aceita conexões de fora.

```
navegador ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared ──▶ 127.0.0.1:8080 (nginx)
                                                              ├─ /      → front (arquivos estáticos)
                                                              └─ /api   → API (Express) ──▶ Mongo
```

## 1. Antes de começar (o que só você cria)

| O quê | Onde | Para quê |
|---|---|---|
| ID do cliente OAuth do Google | Google Cloud Console (veja o README, "Login com Google") | botão "Entrar com o Google" |
| Site key e Secret key do Turnstile | Painel da Cloudflare (README, "Captcha") | captcha no cadastro e no login |
| Entrada do túnel `carteira.exemplo.com` | Cloudflare Zero Trust → Tunnels | publicar o domínio |

Sem o Google e o Turnstile o sistema funciona (login por senha, sem captcha), e a API avisa no
log que o captcha está desligado. Em produção ela **recusa** as chaves de teste da Cloudflare.

## 2. Código no servidor

```bash
cd /srv/lab/projects
git clone git@github.com:seu-usuario/corewallet.git   # com a deploy key do projeto
cd corewallet
```

## 3. `.env` de produção

```bash
cp .env.example .env
# Gere segredos fortes:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
openssl rand -hex 16                                                        # MONGO_ROOT_PASSWORD
```

Valores que mudam em relação ao desenvolvimento:

```ini
WEB_ORIGIN=https://carteira.exemplo.com
COOKIE_SECURE=true
# NODE_ENV_API: não defina (o padrão é "production")
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
# Se 8080 ou 27017 já estiverem em uso por outro projeto:
# WEB_PORT=8091
# MONGO_PORT=27117
```

Remova do `.env` qualquer chave de teste da Cloudflare (`1x000…`, `2x000…`, `3x000…`): em produção a
API não sobe com elas.

## 4. Subir

```bash
docker compose up -d --build
docker compose ps                         # api e mongo "healthy", web "Up"
curl -s http://127.0.0.1:${WEB_PORT:-8080}/api/health
```

## 5. Túnel

No Zero Trust, no túnel `lab`, adicione um *public hostname*:
`carteira.exemplo.com` → `http://localhost:8080` (ou o `WEB_PORT` que você escolheu).

No Google Cloud, em **Origens JavaScript autorizadas**, inclua `https://carteira.exemplo.com`.
No Turnstile, inclua o mesmo domínio em **Hostname**.

## 6. Conferir depois de publicar

```bash
# Cabeçalhos de segurança do nginx
curl -sI https://carteira.exemplo.com | grep -iE "content-security-policy|strict-transport|x-content-type"
# Os cookies da sessão precisam sair com Secure e HttpOnly (faça um login pelo navegador e
# veja em Ferramentas do desenvolvedor → Aplicativo → Cookies):
#   cw_session  HttpOnly  Secure  SameSite=Lax     Path=/api
#   cw_refresh  HttpOnly  Secure  SameSite=Strict  Path=/api/auth
#   cw_csrf               Secure  SameSite=Lax     Path=/
```

Se o login funciona mas a sessão some a cada requisição, quase sempre é `COOKIE_SECURE=true` com
acesso por HTTP (sem o túnel).

## 7. Atualizar

```bash
cd /srv/corewallet
git pull
docker compose up -d --build
```

Os dados ficam no volume `corewallet_mongo-data` e sobrevivem ao rebuild.

## 8. Backup e volta atrás

```bash
# Backup do banco (arquivo compactado com a data)
docker compose exec -T mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db corewallet --archive --gzip' > corewallet-$(date +%F).archive.gz

# Restaurar
docker compose exec -T mongo sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < corewallet-AAAA-MM-DD.archive.gz

# Voltar para uma versão anterior do código
git log --oneline | head
git checkout <commit> && docker compose up -d --build
```

## Atenção com o kernel do servidor

O Mongo 8 não inicia em kernels Linux **6.19 ou mais novos** (veja
[SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)); o contêiner sai na hora com essa
mensagem no log. Antes de atualizar o kernel do servidor, confira se já existe um Mongo corrigido, e
fixe a versão da imagem em `docker-compose.yml` (por exemplo `mongo:8.0`) em vez de seguir `mongo:8`.

## Limites a lembrar em produção

- O limite de tentativas fica na memória da API: serve para uma instância (o caso aqui). Reiniciar a
  API zera os contadores.
- Sessões ficam no Mongo: reiniciar a API não desloga ninguém.
- Não há e-mail de verificação nem recuperação de senha nesta versão.
