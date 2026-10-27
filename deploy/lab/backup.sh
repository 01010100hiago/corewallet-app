#!/bin/sh
# Backup do banco do CoreWallet no lab: um arquivo compactado com a data em backups/,
# mantendo os 14 mais recentes. Roda de dentro de /srv/corewallet.
# Restaurar: veja docs/DEPLOY.md ("Backup e volta atrás").
set -eu
cd "$(dirname "$0")"
mkdir -p backups
arquivo="backups/corewallet-$(date +%F-%H%M).archive.gz"
docker compose exec -T mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db corewallet --archive --gzip' > "$arquivo"
if [ ! -s "$arquivo" ]; then rm -f "$arquivo"; echo "backup vazio, descartado" >&2; exit 1; fi
ls -1t backups/corewallet-*.archive.gz | tail -n +15 | xargs -r rm -f
echo "$arquivo ($(du -h "$arquivo" | cut -f1))"
