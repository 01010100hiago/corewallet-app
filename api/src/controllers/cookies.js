// Nomes dos cookies. Servindo por HTTPS (cookie Secure) todos levam o prefixo `__Host-`: o navegador só
// aceita esse cookie se ele veio de uma conexão segura, sem `Domain` e com `Path=/`. Assim outro subdomínio
// do mesmo domínio não consegue plantar um cookie nosso (cookie tossing: forçar a pessoa a entrar na conta
// do invasor). Sem HTTPS (desenvolvimento em http://localhost) o prefixo é recusado pelo navegador, então
// os nomes e os caminhos ficam como eram.
export function cookieNames(secure) {
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}cw_session`,
    refresh: `${prefix}cw_refresh`,
    csrf: `${prefix}cw_csrf`,
    nonce: `${prefix}cw_gnonce`,
  };
}

// Cookies de versões antigas (sem prefixo, com caminho próprio): só são apagados no logout.
export const LEGACY_COOKIES = [
  { name: "cw_session", path: "/api" },
  { name: "cw_refresh", path: "/api/auth" },
  { name: "cw_csrf", path: "/" },
  { name: "cw_gnonce", path: "/api/auth" },
];
