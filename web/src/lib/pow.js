const defaultDigest = (bytes) => crypto.subtle.digest("SHA-256", bytes);

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Resolve o desafio da verificação automática: procura o número N tal que SHA-256(sal + N) é o
// hash recebido. É o que a API conferirá de novo. Roda sozinho, sem clique, e cede a vez ao
// navegador de tempos em tempos para a tela não travar.
// Devolve o token (base64) para mandar em `captchaToken`.
export async function solveChallenge(challenge, { digest = defaultDigest, signal, yieldEvery = 1500 } = {}) {
  const { algorithm, salt, challenge: target, maxnumber, signature } = challenge;
  if (algorithm !== "SHA-256") throw new Error("Algoritmo de verificação não suportado");
  const want = hexToBytes(target);
  const encoder = new TextEncoder();

  for (let number = 0; number <= maxnumber; number++) {
    if (signal?.aborted) throw new DOMException("Verificação cancelada", "AbortError");
    const hash = new Uint8Array(await digest(encoder.encode(salt + number)));
    let equal = hash.length === want.length;
    for (let i = 0; equal && i < want.length; i++) equal = hash[i] === want[i];
    if (equal) return btoa(JSON.stringify({ algorithm, challenge: target, number, salt, signature }));
    if (number % yieldEvery === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Não foi possível resolver a verificação");
}
