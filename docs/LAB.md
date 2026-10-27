# O CoreWallet no lab do autor

Exemplo real de como o projeto roda no servidor Debian de casa, em **https://carteira.exemplo.com**. Serve de
referência; o passo a passo geral está em [Publicar](DEPLOY.md).

| O quê | Onde |
|---|---|
| Projeto no servidor | `/srv/corewallet/` (compose do lab na raiz, código do GitHub em `app/`) |
| Compose do lab | [`deploy/lab/docker-compose.yml`](../deploy/lab/docker-compose.yml); a cópia do servidor é igual |
| Contêineres | `corewallet-mongo` e `corewallet-api` (só rede interna) e `corewallet-web` (também na rede `edge`) |
| Segredos | `.env` na raiz do projeto, permissão 600, nunca no Git |
| Túnel | `carteira.exemplo.com -> http://corewallet-web:8080` no `config.yml` do cloudflared (o DNS já é coberto pelo wildcard) |
| Porta no servidor | só `127.0.0.1:5191`, para conferir por lá |
| Banco | volume `corewallet_dados-mongo`, sem porta publicada |

Configuração específica: `TRUST_PROXY=2` (o caminho tem navegador, Cloudflare, cloudflared, nginx e API),
`COOKIE_SECURE=true`, `TOTP_ENCRYPTION_KEY` própria. Sem as chaves do Turnstile, vale a verificação automática do
CoreWallet. Sem SMTP, a confirmação de email fica desligada.

## Atualizar

No servidor, em `/srv/corewallet`:

```bash
git -C app pull --ff-only
docker compose up -d --build
curl -s http://127.0.0.1:5191/api/health
```

## Backup

[`deploy/lab/backup.sh`](../deploy/lab/backup.sh) faz uma cópia compactada com a data em `backups/` e mantém as 14
mais recentes. Ele não roda sozinho; para agendar, uma linha no `crontab -e`, por exemplo
`30 3 * * * /srv/corewallet/backup.sh`.
