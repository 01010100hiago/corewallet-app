# Segurança

## Reportar uma vulnerabilidade

Encontrou uma falha? **Não abra uma issue pública.** Use o relato privado do GitHub:
aba **Security** do repositório → **Report a vulnerability**. Descreva o que acontece, como reproduzir e o impacto.
Respondo assim que possível e combinamos a correção antes de divulgar.

## O que o projeto faz e o que não faz

O que existe de proteção (cookies `__Host-`, CSRF, limites de tentativa, 2FA, confirmação de email) e o que ainda
falta está em [docs/SEGURANCA.md](docs/SEGURANCA.md) e [docs/LIMITES.md](docs/LIMITES.md). Este é um projeto de
portfólio: não há recuperação de senha e ele não passou por auditoria externa.
