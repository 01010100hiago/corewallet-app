// Como a página está sendo servida, para o aviso de conexão na sessão.
//   https    conexão criptografada
//   local    http em localhost: o tráfego não sai do computador
//   insecure http numa rede de verdade: a senha e a sessão viajam sem criptografia
export function connectionState({ protocol, hostname }) {
  if (protocol === "https:") return "https";
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
  return local ? "local" : "insecure";
}

// Frase curta sobre a conexão para as telas de proteção: só promete HTTPS quando é HTTPS de verdade.
const FACTS = {
  https: { lead: "Conexão criptografada.", text: "O que você envia viaja por HTTPS." },
  local: { lead: "Conexão local.", text: "Aqui o que você envia não sai do computador." },
  insecure: { lead: "Conexão sem HTTPS.", text: "O que você envia viaja sem criptografia." },
};
export const connectionFact = (location) => FACTS[connectionState(location)];

// Passo "Conexão" mostrado no splash e na tela de entrada com o Google.
const STEPS = {
  https: { label: "Conexão criptografada (HTTPS)", state: "done" },
  local: { label: "Conexão local, neste computador", state: "done" },
  insecure: { label: "Conexão sem HTTPS", state: "warn" },
};

export function connectionStep(location) {
  return STEPS[connectionState(location)];
}
