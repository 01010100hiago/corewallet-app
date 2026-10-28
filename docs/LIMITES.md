# Limites conhecidos

O que ainda não existe ou funciona de forma simplificada.

## Conta e acesso

- **Não existe recuperação de senha** nem exportar os dados ou excluir a conta; a tela diz isso.
- O cadastro avisa quando o email já existe (409). O limite de cadastros por IP reduz o abuso.
- O limite de tentativas por conta pode ser usado para travar o login de alguém por alguns minutos, mas só a partir do
  mesmo IP da pessoa, porque a chave é IP + email.
- Não há limite por conta somando vários IPs. Com 2FA ativo, a trava por conta compensa.
- **Os contadores de limite, os desafios do 2FA e os desafios já usados da verificação automática ficam no Mongo**,
  então várias cópias da API dividem o mesmo estado e reiniciar a API não zera nada. O custo é uma ida ao banco por
  pedido limitado. Se o banco estiver fora do ar, o limite de tentativas **deixa passar** (sem banco nem o login
  funciona), e a verificação automática **recusa** (falha fechada).
- **Confirmação de email:** o link também pede a senha da conta e aceita 5 senhas erradas. Contas pendentes criadas
  antes dessa regra não podem ser assumidas por um novo cadastro (apague-as à mão, veja [Configuração](CONFIGURACAO.md)).
  Sem a confirmação ligada, o cadastro já nasce ativo. Não há recuperação de senha, então quem esquecer a senha de uma
  conta ainda não confirmada precisa de ajuda de quem administra.
- A lista de dispositivos mostra o IP pela metade e navegador e sistema lidos do `User-Agent`, uma leitura aproximada.

## Datas e valores

- Os meses, o dia e a hora de cada lançamento seguem o horário de Brasília (UTC-3 fixo). Quem usa outro fuso vê as
  datas em Brasília.
- A data de um lançamento é a da criação e não pode ser editada. Trocar o tipo (receita ou despesa) exige excluir e
  criar de novo.
- As datas aceitas nos filtros vão de 2000 a 2100.

## Listas e limites de tamanho

- Cada mês mostra no máximo 500 lançamentos; acima disso a tela avisa e os totais continuam corretos.
- O extrato mostra 30 por vez ("Carregar mais"); os totais valem para todos os que combinam com o filtro.
- O registro de alterações mostra os 100 eventos mais recentes, e as listas de excluídos e arquivados mostram até 200
  cada. A tela avisa quando há mais; restaurar ou desarquivar traz os mais antigos.
- A análise cobre no máximo 12 meses. O mês atual ainda está em andamento (a tela avisa), então a despesa média e a
  comparação com o mês anterior o incluem pela metade.

## Histórico

- Lançamentos criados antes do histórico existir não têm o evento "criado"; a tela diz isso.
- **Gravações em mais de um passo são transações do banco** (tudo ou nada): alterar, excluir, arquivar e restaurar um
  lançamento valem junto com o evento do histórico, e apagar uma categoria (mover os lançamentos, gravar o histórico,
  apagar e acertar o contador) é uma operação só. Se o servidor cair no meio, nada fica pela metade. Isso exige o Mongo
  como **réplica** (o `docker-compose.yml` já sobe uma de um nó). Em um Mongo solto a API funciona, mas sem essa garantia, e
  avisa no log ao conectar. Uma categoria com milhares de lançamentos pode passar do limite de tempo de uma transação
  (60 s); o uso pessoal fica muito abaixo disso.
