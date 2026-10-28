#!/bin/sh
# Sobe o Mongo como réplica de UM nó, que é o que as transações exigem. Tenta o Mongo 8 e, se ele não iniciar,
# usa o 7.0: o 8 não inicia em máquinas do GitHub com kernel Linux 6.19+ (SERVER-121912) e isso varia de máquina
# para máquina; os testes só usam recursos comuns. MONGO_NAME e MONGO_PORT mudam o nome e a porta do host (para testar); com outra porta o cliente precisa de directConnection=true.
set -u
nome="${MONGO_NAME:-mongo}"
porta="${MONGO_PORT:-27017}"
for image in mongo:8 mongo:7.0; do
  docker rm -f "$nome" >/dev/null 2>&1 || true
  docker run -d --name "$nome" -p "$porta:27017" "$image" --replSet rs0 --bind_ip_all >/dev/null
  for i in $(seq 1 30); do
    # ping de verdade: a porta abre antes de o Mongo estar pronto, e um contêiner que saiu falha aqui
    if docker exec "$nome" mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q 1; then
      docker exec "$nome" mongosh --quiet --eval "try { rs.status() } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }) }" >/dev/null 2>&1
      for j in $(seq 1 30); do
        if docker exec "$nome" mongosh --quiet --eval "db.hello().isWritablePrimary" 2>/dev/null | grep -q true; then echo "Mongo (réplica) no ar: $image"; exit 0; fi
        sleep 1
      done
      break # respondeu mas não virou primário: desiste desta imagem
    fi
    sleep 1
  done
  echo "$image não subiu. Log:"
  docker logs "$nome" 2>&1 | tail -n 3
done
exit 1
