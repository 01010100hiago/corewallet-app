import PowCaptcha from "./PowCaptcha.jsx";
import Turnstile from "./Turnstile.jsx";

// Escolhe a verificação que a API ligou: o Turnstile da Cloudflare (com chaves) ou a verificação
// automática própria (sem chaves). Mesma interface: onToken(token | "") e resetKey.
export default function Captcha({ config, onToken, resetKey }) {
  if (config.provider === "pow") return <PowCaptcha onToken={onToken} resetKey={resetKey} />;
  return <Turnstile siteKey={config.siteKey} onToken={onToken} resetKey={resetKey} />;
}
