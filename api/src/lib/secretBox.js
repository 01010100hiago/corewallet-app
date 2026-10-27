import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Guarda um texto secreto (o segredo do 2FA) no banco de forma que só a API consiga ler:
// AES-256-GCM com IV novo a cada gravação. O GCM também autentica, então um valor adulterado
// no banco falha ao ler em vez de devolver lixo. A chave sai do JWT_SECRET, sem variável nova.
const VERSION = "v1";

export function createSecretBox(jwtSecret) {
  const key = createHmac("sha256", jwtSecret).update("corewallet:secretbox:v1").digest();
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
      return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
    },
    // Devolve null se o valor não for nosso, estiver adulterado ou a chave tiver mudado.
    open(sealed) {
      try {
        const [version, iv, tag, data] = String(sealed).split(".");
        if (version !== VERSION || !iv || !tag || !data) return null;
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
