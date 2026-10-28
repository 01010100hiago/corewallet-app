# Contribuindo

Este é um projeto de portfólio, mas correções e sugestões são bem-vindas.

- Abra uma issue antes de uma mudança grande. Falhas de segurança: veja [SECURITY.md](SECURITY.md).
- Prepare o ambiente como no [README](README.md) (Node da `.nvmrc`, Mongo do `docker-compose.yml`).
- Antes de abrir o pull request rode `npm run lint`, `npm test` e `npm run test:e2e` (veja [docs/TESTES.md](docs/TESTES.md)).
- Mudança de comportamento leva teste junto, e o teste deve falhar sem a mudança.
