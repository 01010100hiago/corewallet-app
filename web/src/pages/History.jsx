import { useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle.js";
import PageHeader from "../components/PageHeader.jsx";
import Statement from "../components/Statement.jsx";
import Changes from "../components/Changes.jsx";

const TABS = [
  { id: "extrato", label: "Extrato" },
  { id: "alteracoes", label: "Alterações" },
];

// Histórico em duas abas: o extrato (todos os lançamentos, com busca e filtros) e o registro de
// alterações. A aba fica na URL (?aba=alteracoes) para poder voltar e compartilhar o link.
export default function History() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get("aba"))?.id ?? "extrato";
  usePageTitle(tab === "extrato" ? "Extrato" : "Alterações");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Histórico" subtitle="Extrato e alterações" />
      <div role="tablist" aria-label="Histórico" className="flex gap-1 rounded-lg border border-line bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`aba-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="painel-historico"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setParams(t.id === "extrato" ? {} : { aba: t.id }, { replace: true })}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const next = TABS[(TABS.findIndex((x) => x.id === tab) + 1) % TABS.length];
              setParams(next.id === "extrato" ? {} : { aba: next.id }, { replace: true });
              requestAnimationFrame(() => document.getElementById(`aba-${next.id}`)?.focus());
            }}
            className={`h-11 flex-1 rounded-md text-sm font-semibold transition ${tab === t.id ? "bg-pine-900 text-white" : "text-pine-900 hover:bg-mint-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="painel-historico" role="tabpanel" aria-labelledby={`aba-${tab}`}>
        {tab === "extrato" ? <Statement /> : <Changes />}
      </div>
    </div>
  );
}
