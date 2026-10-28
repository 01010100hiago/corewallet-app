#!/bin/sh
# Cria no Mongo um usuário SÓ do CoreWallet (readWrite no banco "corewallet"), para a API não rodar como root.
# Uso, na pasta do projeto, com o stack no ar:   deploy/criar-usuario-do-app.sh SENHA_NOVA
# Depois ponha MONGO_APP_PASSWORD=SENHA_NOVA no .env e, no compose, use na DATABASE_URI o usuário
# `corewallet_app` e essa senha (veja docs/DEPLOY.md). A senha só pode ter letras e números.
set -eu
senha="${1:?uso: $0 SENHA_NOVA (só letras e números)}"
case "$senha" in *[!A-Za-z0-9]*) echo "a senha só pode ter letras e números" >&2; exit 1 ;; esac
docker compose exec -T mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin corewallet --eval "
const u = db.getUser(\"corewallet_app\");
if (u) db.updateUser(\"corewallet_app\", { pwd: \"'"$senha"'\", roles: [{ role: \"readWrite\", db: \"corewallet\" }] });
else db.createUser({ user: \"corewallet_app\", pwd: \"'"$senha"'\", roles: [{ role: \"readWrite\", db: \"corewallet\" }] });
print(u ? \"usuário atualizado\" : \"usuário criado\");"'
