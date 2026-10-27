# Publicar

Guia para subir o CoreWallet em um servidor Linux com Docker, atrás de um túnel da Cloudflare. A configuração do
`.env` está em [Configuração](CONFIGURACAO.md); o exemplo real do autor está em [LAB.md](LAB.md).

## Desenho

O navegador chega pela Cloudflare (HTTPS), o `cloudflared` do servidor entrega no nginx do CoreWallet, o nginx serve
o front e encaminha `/api` para a API, e a API fala com o Mongo na rede interna do Docker. Fora a própria
máquina (`127.0.0.1:8080` para o site e `127.0.0.1:27017` para o Mongo), nada fica exposto e o Mongo não aceita
conexões de fora.

```
navegador ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared ──▶ 127.0.0.1:8080 (nginx)
                                                              ├─ /      → front (arquivos estáticos)
                                                              └─ /api   → API (Express) ──▶ Mongo
```

## 1. O que só você cria

| O quê | Para quê |
|---|---|
| Túnel e *public hostname* na Cloudflare (Zero Trust → Tunnels) | publicar o domínio |
| ID do cliente OAuth do Google (opcional) | botão "Entrar com o Google" |
| Chaves do Turnstile (opcional) | captcha da Cloudflare; sem elas vale a verificação automática do CoreWallet |
| Provedor de SMTP (opcional) | confirmação de email |

Como criar cada um está em [Configuração](CONFIGURACAO.md). Sem os opcionais o sistema funciona com login por senha.

## 2. Código no servidor

```bash
git clone git@github.com:seu-usuario/corewallet.git
cd corewallet
```

## 3. `.env`

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
openssl rand -hex 16                                                        # MONGO_ROOT_PASSWORD
openssl rand -hex 32                                                        # TOTP_ENCRYPTION_KEY
```

O que muda em relação ao desenvolvimento:

```ini
WEB_ORIGIN=https://seu.dominio.com
COOKIE_SECURE=true
TRUST_PROXY=2                # atrás do túnel da Cloudflare; veja Configuração
TOTP_ENCRYPTION_KEY=...      # defina ANTES de alguém ativar o 2FA
# Se 8080 ou 27017 já estiverem em uso por outro projeto:
# WEB_PORT=8091
# MONGO_PORT=27117
```

Remova do `.env` qualquer chave de teste da Cloudflare (`1x000…`, `2x000…`, `3x000…`): em produção a API não sobe
com elas.

## 4. Subir

```bash
docker compose up -d --build
docker compose ps                                       # api e mongo "healthy", web "Up"
curl -s http://127.0.0.1:${WEB_PORT:-8080}/api/health
```

## 5. Túnel

No Zero Trust, no seu túnel, adicione um *public hostname* apontando para `http://localhost:8080` (ou o `WEB_PORT`
escolhido). Se usar login com Google ou Turnstile, inclua o domínio nas origens autorizadas do Google e no
**Hostname** do Turnstile.

## 6. Conferir

```bash
curl -sI https://seu.dominio.com | grep -iE "content-security-policy|strict-transport|x-content-type"
```

Faça um login pelo navegador e veja em Ferramentas do desenvolvedor → Aplicativo → Cookies:

```
cw_session  HttpOnly  Secure  SameSite=Lax     Path=/api
cw_refresh  HttpOnly  Secure  SameSite=Strict  Path=/api/auth
cw_csrf               Secure  SameSite=Lax     Path=/
```

Se o login funciona mas a sessão some a cada requisição, quase sempre é `COOKIE_SECURE=true` com acesso por HTTP,
sem o túnel.

## 7. Atualizar

```bash
git pull --ff-only
docker compose up -d --build        # só recria o que mudou
```

Os dados ficam no volume do Mongo e sobrevivem ao rebuild. Para voltar a uma versão anterior:
`git checkout <commit> && docker compose up -d --build`.

## Backup (opcional)

```bash
# Cópia compactada do banco
docker compose exec -T mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db corewallet --archive --gzip' > corewallet-$(date +%F).archive.gz

# Restaurar (apaga o que existe)
docker compose exec -T mongo sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < corewallet-AAAA-MM-DD.archive.gz
```

O arquivo tem hashes de senha e dados financeiros: guarde-o com permissão restrita.

## Atenção com o kernel do servidor

O Mongo 8 não inicia em kernels Linux **6.19 ou mais novos** (veja
[SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)); o contêiner sai na hora com essa mensagem no log.
Antes de atualizar o kernel, confira se já existe um Mongo corrigido, e fixe a versão da imagem em
`docker-compose.yml` (por exemplo `mongo:8.0`) em vez de seguir `mongo:8`.

## Em produção, lembre

- Os limites de tentativa ficam na memória da API: servem para **uma instância**, e reiniciar a API zera os
  contadores. Veja [Limites conhecidos](LIMITES.md).
- As sessões ficam no Mongo: reiniciar a API não desloga ninguém.
- Não há recuperação de senha nesta versão.
