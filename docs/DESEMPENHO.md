# Desempenho e escala

A API pode rodar em **várias cópias** atrás do nginx. Isto é uma demonstração técnica: para a carga de hoje, uma
cópia basta, e as medidas abaixo mostram por quê.

## O que torna possível

Antes, os limites de tentativa, os desafios do 2FA e os da verificação automática ficavam na memória de cada
processo. Com várias cópias, cada uma teria a sua contagem (o limite seria multiplicado por N) e um desafio usado em
uma cópia poderia ser reaproveitado em outra. Agora esse estado fica no Mongo:

| Estado | Como fica no banco |
|---|---|
| Contadores do limite de tentativas | Um documento por chave, com incremento atômico (a janela vence e recomeça na própria atualização) |
| Desafio da 2ª etapa do 2FA | Uma operação atômica abre a conferência, soma a tentativa e trava as conferências simultâneas; outra a marca como gasta |
| Desafios já usados da verificação automática | Índice único: só uma cópia consegue registrar o mesmo desafio |

Todos têm expiração automática (índice TTL). Sessões, que já estavam no Mongo, continuam iguais. Os testes de
`api/test/sharedstate.test.js` sobem duas instâncias da API no mesmo banco e provam cada ponto (limite dividido,
desafio que não vale em outra cópia, tentativas somadas), e cada prova falha se a regra for removida.

Com o banco fora do ar, o limite de tentativas **deixa passar** (sem banco nem o login funciona) e a verificação
automática **recusa** (falha fechada).

## Como subir várias cópias

```bash
API_REPLICAS=4 API_CPUS=1 docker compose -f docker-compose.yml -f docker-compose.escala.yml up -d --build
```

O arquivo `docker-compose.escala.yml` é opcional: define quantas cópias da API sobem e quanta CPU cada uma pode usar.
O nginx já resolve o nome `api` pelo DNS do Docker a cada 10 s e reparte os pedidos entre as cópias. Em
`docker stats` dá para ver todas trabalhando (nas medidas abaixo, a carga se espalhou entre as 2 e as 4 cópias).

## Medidas

Gerador: [`e2e/carga.mjs`](../e2e/carga.mjs) (sem dependências), 12 s por rodada, duas rodadas por linha. Cada cópia da
API limitada a **1 núcleo**; o Mongo e o nginx no mesmo Docker.

```bash
node e2e/carga.mjs --url http://localhost:8091 --cenario login --conexoes 16 --segundos 12
```

Para os cenários `login` e `lancamentos` a API precisa estar com `CAPTCHA_POW=off` e `RATE_LIMITS=off` (só em
desenvolvimento: em produção a API recusa `RATE_LIMITS=off`).

**Login (bcrypt custo 12, trabalho de CPU), pedidos por segundo:**

| Cópias da API (1 núcleo cada) | Rodada 1 | Rodada 2 | Latência típica (p50) |
|---|---|---|---|
| 1 | 3 | 3 | 4,8 s |
| 2 | 8 | 8 | 1,8 s |
| 4 | 16 | 16 | 0,8 s |
| **1 processo com 4 núcleos** | 16 | 16 | **1,0 s** |

**Lista de lançamentos (leitura do Mongo), pedidos por segundo:**

| Configuração | Rodada 1 | Rodada 2 |
|---|---|---|
| 1 cópia, 1 núcleo | 1355 | 1109 |
| 2 cópias | 1502 | 1513 |
| 4 cópias | 1186 | 1178 |
| 1 processo com 4 núcleos | 1043 | 915 |

## O que isso mostra

- **O trabalho de CPU escala com as cópias** (login: 3, 8 e 16 por segundo com 1, 2 e 4 cópias de um núcleo), e a
  latência cai junto. A demonstração funciona: várias cópias dividem o mesmo estado e se comportam como uma só.
- **Um processo com 4 núcleos faz o mesmo que 4 cópias de 1 núcleo** (16 por segundo, com latência até menor). O
  bcrypt já roda em paralelo dentro do Node, então, para esta carga, várias cópias **não rendem mais** que um processo
  com os núcleos liberados. O que elas dão é isolamento e disponibilidade: uma cópia pode reiniciar sem derrubar o site.
- **A leitura de lançamentos não escala** com cópias: o limite é o Mongo e a máquina de teste, não o Node. Mais cópias
  só adicionam concorrência pelos mesmos recursos.
- **As rotas leves (`/auth/config`) saturam a máquina de teste**, não a API: o Mac roda o Docker, o Mongo e o gerador
  de carga juntos, e os números variam muito de uma rodada para outra. Por isso ficaram de fora da tabela.
- Cada pedido limitado faz uma ida a mais ao Mongo (o contador). O custo é pequeno perto do que o pedido já faz, mas
  existe.

Limites desta medida: uma máquina só (gerador, Docker e Mongo disputando CPU), 12 s por rodada e duas rodadas. Serve
para comparar as configurações entre si, não como número de capacidade de um servidor.

## Em um servidor com nome de contêiner fixo

O compose do repositório não fixa o nome do contêiner da API, então `replicas` funciona. O compose do lab fixa
`container_name: corewallet-api`, que impede várias cópias; para escalar lá, esse nome precisa sair.
