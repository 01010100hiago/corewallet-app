// Ícones do CoreWallet, desenhados para o projeto. Grade de 24, traço de 1,6,
// duas tonalidades: base suave (.t) e acento (.a, .f, .k) na cor --icon-accent.
// Os estilos estão em index.css (classe .ic).
const paths = {
  carteira: (
    <>
      <rect className="t" x={3} y={7.5} width={18} height={12.5} rx={3.5} />
      <path d="M6.5 7.5 L15.8 4.1 a1 1 0 0 1 1.3 .8 L17.4 7.5" />
      <rect x={3} y={7.5} width={18} height={12.5} rx={3.5} />
      <path className="k" d="M21 12 H17.5 a2 2 0 0 0 0 4 H21 Z" />
      <path className="a" d="M21 12 H17.5 a2 2 0 0 0 0 4 H21" />
      <circle className="f" cx={17.6} cy={14} r={0.9} />
    </>
  ),
  email: (
    <>
      <rect className="t" x={3} y={5.5} width={18} height={13} rx={3.5} />
      <rect x={3} y={5.5} width={18} height={13} rx={3.5} />
      <path d="M4 8.2 L11.1 13 a1.7 1.7 0 0 0 1.8 0 L20 8.2" />
      <circle className="f" cx={19.2} cy={6.3} r={2.4} />
    </>
  ),
  cadeado: (
    <>
      <rect className="t" x={5} y={10.5} width={14} height={10} rx={3.2} />
      <path d="M8.5 10.5 V8 a3.5 3.5 0 0 1 7 0 V10.5" />
      <rect x={5} y={10.5} width={14} height={10} rx={3.2} />
      <circle className="k" cx={12} cy={15.3} r={3} />
      <circle className="f" cx={12} cy={15} r={1.5} />
      <path className="a" d="M12 15.6 V17.4" />
    </>
  ),
  senha: (
    <>
      <rect className="t" x={2.5} y={6.5} width={19} height={11} rx={3.5} />
      <rect x={2.5} y={6.5} width={19} height={11} rx={3.5} />
      <circle className="d" cx={7} cy={12} r={1.2} />
      <circle className="d" cx={11} cy={12} r={1.2} />
      <circle className="d" cx={15} cy={12} r={1.2} />
      <path className="a" d="M18.4 9.6 V14.4" />
    </>
  ),
  mostrar: (
    <>
      <path className="t" d="M2.5 12 C4.8 7.8 8.2 5.8 12 5.8 s7.2 2 9.5 6.2 c-2.3 4.2 -5.7 6.2 -9.5 6.2 s-7.2 -2 -9.5 -6.2 z" />
      <path d="M2.5 12 C4.8 7.8 8.2 5.8 12 5.8 s7.2 2 9.5 6.2 c-2.3 4.2 -5.7 6.2 -9.5 6.2 s-7.2 -2 -9.5 -6.2 z" />
      <circle cx={12} cy={12} r={3.1} />
      <circle className="f" cx={12} cy={12} r={1.2} />
    </>
  ),
  ocultar: (
    <>
      <path className="t" d="M2.5 12 C4.8 7.8 8.2 5.8 12 5.8 s7.2 2 9.5 6.2 c-2.3 4.2 -5.7 6.2 -9.5 6.2 s-7.2 -2 -9.5 -6.2 z" />
      <path d="M2.5 12 C4.8 7.8 8.2 5.8 12 5.8 s7.2 2 9.5 6.2 c-2.3 4.2 -5.7 6.2 -9.5 6.2 s-7.2 -2 -9.5 -6.2 z" />
      <circle cx={12} cy={12} r={3.1} />
      <path className="a" d="M4.5 4.5 L19.5 19.5" />
    </>
  ),
  escudo: (
    <>
      <path className="t" d="M12 3 L19.5 5.8 V11.4 c0 4.6 -3.1 7.8 -7.5 9.6 c-4.4 -1.8 -7.5 -5 -7.5 -9.6 V5.8 Z" />
      <path d="M12 3 L19.5 5.8 V11.4 c0 4.6 -3.1 7.8 -7.5 9.6 c-4.4 -1.8 -7.5 -5 -7.5 -9.6 V5.8 Z" />
      <path className="a" d="M8.7 12 L11 14.3 L15.4 9.6" />
    </>
  ),
  cookie: (
    <>
      <path className="t" d="M12 3 a9 9 0 1 0 9 9 a4 4 0 0 1 -4 -4 a4 4 0 0 1 -5 -5 z" />
      <path d="M12 3 a9 9 0 1 0 9 9 a4 4 0 0 1 -4 -4 a4 4 0 0 1 -5 -5 z" />
      <circle className="f" cx={8.5} cy={10} r={1.2} />
      <circle className="f" cx={11.5} cy={15.5} r={1.2} />
      <circle className="f" cx={16} cy={15} r={1.2} />
    </>
  ),
  computador: (
    <>
      <rect className="t" x={3} y={4.5} width={18} height={12} rx={3} />
      <rect x={3} y={4.5} width={18} height={12} rx={3} />
      <path d="M9 20 H15 M12 16.5 V20" />
      <circle className="f" cx={17.5} cy={8.2} r={1.2} />
    </>
  ),
  celular: (
    <>
      <rect className="t" x={7} y={2.5} width={10} height={19} rx={3} />
      <rect x={7} y={2.5} width={10} height={19} rx={3} />
      <path d="M10.5 5.6 H13.5" />
      <path className="a" d="M10.5 18.4 H13.5" />
    </>
  ),
  chave: (
    <>
      <circle className="t" cx={8} cy={14.5} r={4.4} />
      <circle cx={8} cy={14.5} r={4.4} />
      <path d="M11.2 11.3 L20.5 3.5 M17.5 6 L19.8 8.3 M14.6 8.5 L16.4 10.3" />
      <circle className="f" cx={8} cy={14.5} r={1.4} />
    </>
  ),
  editar: (
    <>
      <path className="t" d="M15.6 4.4 a2.1 2.1 0 0 1 3 0 l1 1 a2.1 2.1 0 0 1 0 3 L9.2 18.4 L4.5 19.5 L5.6 14.8 Z" />
      <path d="M15.6 4.4 a2.1 2.1 0 0 1 3 0 l1 1 a2.1 2.1 0 0 1 0 3 L9.2 18.4 L4.5 19.5 L5.6 14.8 Z" />
      <path className="a" d="M13.6 6.4 L17.6 10.4" />
      <path d="M5.6 14.8 L9.2 18.4" />
    </>
  ),
  lixeira: (
    <>
      <path className="t" d="M6.2 8 H17.8 L17 18.6 a2.2 2.2 0 0 1 -2.2 2 H9.2 a2.2 2.2 0 0 1 -2.2 -2 Z" />
      <path d="M6.2 8 H17.8 L17 18.6 a2.2 2.2 0 0 1 -2.2 2 H9.2 a2.2 2.2 0 0 1 -2.2 -2 Z" />
      <path d="M4.5 8 H19.5" />
      <path className="a" d="M9.5 8 V6.2 a1.6 1.6 0 0 1 1.6 -1.6 h1.8 a1.6 1.6 0 0 1 1.6 1.6 V8" />
      <path d="M10 11.6 V16.6 M14 11.6 V16.6" />
    </>
  ),
  arquivar: (
    <>
      <rect className="t" x={3} y={4} width={18} height={5} rx={1.6} />
      <rect x={3} y={4} width={18} height={5} rx={1.6} />
      <path d="M5 9 V17.4 a2.6 2.6 0 0 0 2.6 2.6 H16.4 a2.6 2.6 0 0 0 2.6 -2.6 V9" />
      <path className="a" d="M12 11.6 V16.6 M9.8 14.6 L12 16.8 L14.2 14.6" />
    </>
  ),
  categorias: (
    <>
      <path className="t" d="M3.5 11.6 V5.6 a2 2 0 0 1 2 -2 h6 a2 2 0 0 1 1.4 .6 l7 7 a2 2 0 0 1 0 2.8 l-6.2 6.2 a2 2 0 0 1 -2.8 0 l-7 -7 a2 2 0 0 1 -.4 -1.6 Z" />
      <path d="M3.5 11.6 V5.6 a2 2 0 0 1 2 -2 h6 a2 2 0 0 1 1.4 .6 l7 7 a2 2 0 0 1 0 2.8 l-6.2 6.2 a2 2 0 0 1 -2.8 0 l-7 -7 a2 2 0 0 1 -.4 -1.6 Z" />
      <circle className="f" cx={8} cy={8} r={1.4} />
    </>
  ),
  grafico: (
    <>
      <rect className="t" x={3} y={3.5} width={18} height={17} rx={3.5} />
      <rect x={3} y={3.5} width={18} height={17} rx={3.5} />
      <path d="M7.5 9 H13" />
      <path d="M7.5 12.5 H16.5" />
      <path className="a" d="M7.5 16 H11" />
    </>
  ),
  sair: (
    <>
      <path d="M10 4 H6.5 a3 3 0 0 0 -3 3 V17 a3 3 0 0 0 3 3 H10" />
      <path d="M9.5 12 H20.5" />
      <path className="a" d="M16.5 8 L20.5 12 L16.5 16" />
    </>
  ),
  mais: (
    <>
      <circle className="t" cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={9} />
      <path className="a" d="M12 8 V16 M8 12 H16" />
    </>
  ),
  menos: (
    <>
      <circle className="t" cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={9} />
      <path className="a" d="M8 12 H16" />
    </>
  ),
  entrada: (
    <>
      <circle className="t" cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={9} />
      <path className="a" d="M12 7.5 V16 M8.4 12.6 L12 16.2 L15.6 12.6" />
    </>
  ),
  saida: (
    <>
      <circle className="t" cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={9} />
      <path className="a" d="M12 16.5 V8 M8.4 11.4 L12 7.8 L15.6 11.4" />
    </>
  ),
  voltar: (
    <>
      <path d="M20 12 H5" />
      <path className="a" d="M11 6 L5 12 L11 18" />
    </>
  ),
  ok: (
    <>
      <circle className="t" cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={9} />
      <path className="a" d="M8 12.3 L10.9 15.2 L16.1 9.4" />
    </>
  ),
  pendente: (
    <>
      <circle cx={12} cy={12} r={9} strokeDasharray="2.2 3.1" opacity={0.85} />
    </>
  ),
  atividade: (
    <>
      <rect className="t" x={3.5} y={3.5} width={17} height={17} rx={4} />
      <rect x={3.5} y={3.5} width={17} height={17} rx={4} />
      <path className="a" d="M8 9 H16" />
      <path d="M8 12.5 H16 M8 16 H12.5" />
    </>
  ),
  relogio: (
    <>
      <circle className="t" cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={9} />
      <path className="a" d="M12 7.4 V12 L15.2 14" />
    </>
  ),
  renovar: (
    <>
      <circle className="t" cx={12} cy={12.4} r={6.4} />
      <path d="M20 12.5 a8 8 0 1 1 -2.300 -5.600 L20.500 9.700" />
      <path className="a" d="M20.500 4.500 V9.700 H15.300" />
    </>
  ),
  aviso: (
    <>
      <path className="t" d="M10.6 4.6 a1.6 1.6 0 0 1 2.8 0 L21 18 a1.6 1.6 0 0 1 -1.4 2.4 H4.4 A1.6 1.6 0 0 1 3 18 Z" />
      <path d="M10.6 4.6 a1.6 1.6 0 0 1 2.8 0 L21 18 a1.6 1.6 0 0 1 -1.4 2.4 H4.4 A1.6 1.6 0 0 1 3 18 Z" />
      <path className="a" d="M12 9.6 V13.4" />
      <circle className="f" cx={12} cy={16.4} r={1.1} />
    </>
  ),
  pessoa: (
    <>
      <circle className="t" cx={12} cy={8.5} r={3.7} />
      <circle cx={12} cy={8.5} r={3.7} />
      <path className="t" d="M4.8 20.5 c.6 -4 3.5 -6.2 7.2 -6.2 s6.6 2.200 7.2 6.200 Z" />
      <path className="a" d="M4.8 20.5 c.6 -4 3.5 -6.2 7.2 -6.2 s6.6 2.200 7.2 6.200" />
    </>
  ),
};

export default function Icon({ name, className = "size-6", title }) {
  const content = paths[name];
  if (!content) throw new Error(`Ícone desconhecido: ${name}`);
  return (
    <svg
      viewBox="0 0 24 24"
      className={`ic ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {content}
    </svg>
  );
}
