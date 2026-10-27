// Ilustração da tela de acesso: uma carteira trancada, protegida por cadeado,
// com moedas e selos de verificação. Desenhada para o CoreWallet; as cores
// vêm do tema (classes fill-* e stroke-*), então muda junto com a paleta.
export default function Illustration({ className = "" }) {
  return (
    <svg viewBox="0 0 320 224" className={className} role="img" aria-label="Carteira trancada com cadeado, protegida por selos de verificação">
      <circle cx="160" cy="114" r="98" className="fill-pine-800" />
      <circle cx="160" cy="114" r="98" className="fill-none stroke-pine-700" strokeWidth="1.5" strokeDasharray="3 7" strokeLinecap="round" />
      <circle cx="160" cy="114" r="70" className="fill-none stroke-pine-700/60" strokeWidth="1" />

      <g className="fill-coral-100">
        <circle cx="62" cy="62" r="17" />
        <circle cx="268" cy="64" r="10" />
        <circle cx="282" cy="132" r="6" />
      </g>
      <text x="62" y="68" textAnchor="middle" fontSize="16" fontWeight="600" className="fill-coral-800">R$</text>

      <rect x="84" y="86" width="156" height="104" rx="20" className="fill-pine-950" />
      <g transform="rotate(-5 160 90)">
        <rect x="100" y="64" width="112" height="52" rx="9" className="fill-mint-300" />
        <rect x="112" y="78" width="40" height="6" rx="3" className="fill-pine-900/35" />
        <rect x="112" y="92" width="64" height="6" rx="3" className="fill-pine-900/25" />
        <circle cx="194" cy="82" r="8" className="fill-coral-500" />
      </g>
      <rect x="84" y="98" width="156" height="92" rx="20" className="fill-pine-700" />
      <path d="M104 98 h116 a20 20 0 0 1 20 20 v-6 a14 14 0 0 0 -14 -14 h-128 a14 14 0 0 0 -14 14 v6 a20 20 0 0 1 20 -20 z" className="fill-mint-300/25" />
      <rect x="94" y="108" width="136" height="72" rx="13" className="fill-none stroke-mint-300/45" strokeWidth="1.5" strokeDasharray="4 5" />

      <rect x="198" y="128" width="54" height="36" rx="13" className="fill-coral-500" />
      <circle cx="216" cy="146" r="5.5" className="fill-pine-950" />

      <path d="M135 142 v-10 a13 13 0 0 1 26 0 v10" className="fill-none stroke-mint-50" strokeWidth="6.5" strokeLinecap="round" />
      <rect x="124" y="140" width="48" height="38" rx="10" className="fill-mint-50" />
      <circle cx="148" cy="156" r="5.5" className="fill-pine-900" />
      <rect x="146.4" y="157" width="3.2" height="10" rx="1.6" className="fill-pine-900" />

      <circle cx="258" cy="184" r="19" className="fill-mint-300" />
      <path d="M249.500 184.500 l6 6 l11 -12" className="fill-none stroke-pine-900" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="58" cy="168" r="12" className="fill-mint-300" />
      <path d="M52.500 168.500 l4 4 l7.500 -8.500" className="fill-none stroke-pine-900" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      <g className="stroke-coral-500" strokeWidth="2.5" strokeLinecap="round">
        <path d="M96 38 v10 M91 43 h10" />
        <path d="M236 28 v8 M232 32 h8" />
      </g>
    </svg>
  );
}
