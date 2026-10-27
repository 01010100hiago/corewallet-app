// Descreve o aparelho a partir do User-Agent, só para a pessoa reconhecer a sessão
// na lista. É uma leitura por padrões simples, não uma identificação exata.
const BROWSERS = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS = [
  [/Android/, "Android", "phone"],
  [/iPhone|iPad|iPod/, "iOS", "phone"],
  [/Windows/, "Windows", "computer"],
  [/Mac OS X|Macintosh/, "macOS", "computer"],
  [/Linux|X11/, "Linux", "computer"],
];

export function describeDevice(userAgent = "") {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent));
  if (!browser && !system) return { label: "Aparelho desconhecido", kind: "computer" };
  return {
    label: [browser ?? "Navegador", system ? `no ${system[1]}` : ""].filter(Boolean).join(" "),
    kind: system?.[2] ?? "computer",
  };
}

// Mostra só o começo do IP, o suficiente para estranhar um acesso de outro lugar.
export function maskIp(ip = "") {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.•.•`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}:•`;
  return "";
}
