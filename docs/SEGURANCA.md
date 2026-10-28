# Segurança

O que o CoreWallet faz a mais que o projeto do curso, agrupado por assunto. A interface só afirma o que o código
faz de verdade; o que ainda não existe está em [Limites conhecidos](LIMITES.md).

## Sessão

- **Cookie `httpOnly`:** o token nunca fica visível para o JavaScript da página (o curso usa `js-cookie`). Sair
  apaga a sessão no servidor, não só o cookie.
- **Acesso curto, renovação rotativa:** o token de acesso dura 15 minutos. A sessão (até 30 dias) é renovada por um
  token opaco que **troca a cada uso**, e o banco guarda só o hash dele. Um token já trocado que reapareça depois de
  10 segundos foi copiado, e a sessão inteira é encerrada. Duas abas renovando juntas são tratadas como corrida normal.
- **Dispositivos conectados:** a conta mostra cada sessão (navegador, sistema, começo do IP e último uso) e deixa
  encerrar uma ou todas. Encerrar derruba o acesso na hora, porque o token de acesso só vale enquanto a sessão existir.
- **Sessão transparente:** o selo "Sessão protegida" mostra quando a sessão começou, quando vence (pela hora do
  servidor) e se a conexão é HTTPS. Se a renovação for recusada, a tela volta ao login e diz o motivo.

## Entrada

- **Senha:** bcrypt custo 12, mínimo de 8 caracteres, máximo de 72 *bytes* (o limite real do bcrypt) e lista de
  senhas comuns recusadas. O medidor da tela usa as mesmas regras da API.
- **Verificação em duas etapas (TOTP)** com códigos de recuperação, segredo cifrado e trava por conta. Veja
  [Configuração](CONFIGURACAO.md#verificação-em-duas-etapas).
- **Confirmação de email** por link de uso único, e **verificação anti-robô** no cadastro e no login. Veja
  [Configuração](CONFIGURACAO.md).
- **Login sem revelar quais emails existem:** mesma resposta e mesmo tempo para email errado e senha errada.
- **Limite de tentativas** (`express-rate-limit`): por IP em login, cadastro, Google e renovação; no login também por
  IP + email, contando só os erros, então quem acerta a senha não gasta o limite. Os contadores ficam no Mongo, com
  incremento atômico, e por isso valem entre várias cópias da API.

## Requisições

- **CSRF em duas camadas:** a `Origin` precisa ser a do próprio site, e requisições que mudam dados repetem o cookie
  `cw_csrf` no cabeçalho `X-CSRF-Token` (double submit). O cookie de renovação é `SameSite=Strict`.
- **Validação nos dois lados com o mesmo código:** os schemas Zod ficam em `shared/` e a API valida tudo de novo.
  Objetos no lugar de texto (injeção NoSQL) são recusados.
- **Cabeçalhos:** CSP, `X-Frame-Options` e `nosniff` no nginx; `helmet` na API; respostas da API com
  `Cache-Control: no-store`.
- **A API para na hora** se faltar variável de ambiente, em vez de subir quebrada. Em produção ela também recusa
  `RATE_LIMITS=off`, `MAIL_OUTBOX_FILE` e as chaves de teste da Cloudflare.

## Dados

- **Cada pessoa só vê os próprios lançamentos.** `userId` e `createdAt` nunca vêm do cliente. Id de outra pessoa
  responde 404, igual a "não existe".
- **Horário do servidor:** o horário de um lançamento, "hoje", "ontem" e o mês atual vêm sempre do servidor, em
  Brasília. Nada que o aparelho mande (relógio, fuso) entra neles.
- **Exclusão suave e histórico:** excluir marca o lançamento em vez de apagá-lo; cada criação, edição (com "de →
  para"), exclusão e restauração vira um evento que só cresce, sem rota para alterar ou apagar eventos. Editar e
  excluir ao mesmo tempo é seguro: a gravação só vale se o lançamento ainda estiver como foi lido.
- **Arquivar:** o lançamento sai da lista, mas continua valendo no saldo, nos totais e na análise. Arquivado não se
  edita nem se exclui sem desarquivar (a API responde 409).
- **Categorias:** só valem para o dono e para o tipo certo ("Salário" não existe numa despesa). O limite de 30 por
  tipo é garantido por uma reserva atômica, mesmo com criações simultâneas.
- **Dinheiro em centavos inteiros**, sem erro de ponto flutuante, com o saldo calculado no banco.
- Mongo com usuário e senha, acessível só pela máquina local.

## Falhas e lentidão

- **Limites de tempo no banco:** a API desiste de achar o Mongo em 5 s, de uma resposta em 10 s, e o Mongo para sozinho
  uma consulta que passe de 8 s. O navegador desiste em 15 s, então a API falha antes.
- **Banco indisponível vira 503** com `Retry-After`, e não um 500 genérico. A rota `/api/health` confere com um ping de
  verdade (conexão aberta mas travada conta como fora do ar).
- **Pedidos lentos de propósito são derrubados:** 20 s para os cabeçalhos e 30 s no total na API; no nginx, 15 s para
  cabeçalho e corpo, corpo de até 16 kB e 30 s esperando a API.
- **Parar a API não corta pedidos:** ao receber o sinal de parada (deploy, reinício), ela termina o que está em andamento
  por até 10 s e só então fecha o banco.

## Interface

- **Acessibilidade:** rótulos visíveis, foco que vai para o título a cada troca de página, anel de foco legível em
  fundo claro e escuro, regras da senha lidas por leitor de tela, título de aba por tela, e tabela acessível em cada
  gráfico. Os efeitos de movimento são desligados para quem pede menos movimento.
- **Valores escondidos com um toque:** o olhinho troca todos os valores por `R$ ••••`, também nos gráficos e no
  leitor de tela, e lembra a escolha neste aparelho.

## Integração contínua

GitHub Actions com lint, testes, `npm audit` e build das imagens. O Dependabot confere as dependências npm toda semana e
as ações e imagens Docker todo mês.
