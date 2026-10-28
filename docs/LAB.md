# Exemplo de servidor caseiro

Exemplo de como o projeto pode rodar em um servidor Debian caseiro, atrás de um túnel da Cloudflare. Serve de
referência; o passo a passo geral está em [Publicar](DEPLOY.md). Os nomes abaixo são ilustrativos: troque pelos seus.

| O quê | Exemplo |
|---|---|
| Projeto no servidor | `/srv/projetos/corewallet/` (compose na raiz, código do GitHub em `app/`) |
| Compose | [`deploy/lab/docker-compose.yml`](../deploy/lab/docker-compose.yml), que usa nomes de contêiner fixos |
| Contêineres | `corewallet-mongo` e `corewallet-api` (só rede interna) e `corewallet-web` (também na rede `edge`, a do túnel) |
| Segredos | `.env` na raiz do projeto, permissão 600, nunca no Git (inclui `WEB_ORIGIN`, obrigatório) |
| Túnel | `carteira.exemplo.com -> http://corewallet-web:8080` na configuração do `cloudflared` |
| Porta no servidor | só `127.0.0.1:5191`, para conferir por lá |
| Banco | volume `corewallet_dados-mongo`, sem porta publicada |

Configuração específica: `TRUST_PROXY=1` com `realip-cloudflare.conf` no nginx (o IP da pessoa vem do `CF-Connecting-IP`, só de redes privadas), a API entrando no Mongo com um usuário só dela (`MONGO_APP_PASSWORD`),
`COOKIE_SECURE=true`, `TOTP_ENCRYPTION_KEY` própria. O Mongo roda como réplica de um nó (transações). Sem as chaves do Turnstile, vale a verificação automática do
CoreWallet. Sem SMTP, a confirmação de email fica desligada e o cadastro já nasce ativo.

## Atualizar

Na pasta do projeto no servidor:

```bash
git -C app pull --ff-only
docker compose up -d --build
curl -s http://127.0.0.1:5191/api/health
```

## Backup

[`deploy/lab/backup.sh`](../deploy/lab/backup.sh) faz uma cópia compactada com a data em `backups/` e mantém as 14
mais recentes. Ele não roda sozinho; para agendar, uma linha no `crontab -e`, por exemplo
`30 3 * * * /srv/projetos/corewallet/backup.sh`.
