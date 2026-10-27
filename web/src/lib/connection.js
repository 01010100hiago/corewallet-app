// Como a página está sendo servida, para o aviso de conexão na sessão.
//   https    conexão criptografada
//   local    http em localhost: o tráfego não sai do computador
//   insecure http numa rede de verdade: a senha e a sessão viajam sem criptografia
export function connectionState({ protocol, hostname }) {
  if (protocol === "https:") return "https";
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
  return local ? "local" : "insecure";
}

// Passo "Conexão" mostrado no splash e na tela de entrada com o Google.
const STEPS = {
  https: { label: "Conexão criptografada (HTTPS)", state: "done" },
  local: { label: "Conexão local, neste computador", state: "done" },
  insecure: { label: "Conexão sem HTTPS", state: "warn" },
};

export function connectionStep(location) {
  return STEPS[connectionState(location)];
}
