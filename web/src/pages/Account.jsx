import { useAuth } from "../context/authContext.js";
import DataWeKeep from "../components/DataWeKeep.jsx";
import Devices from "../components/Devices.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";
import { inBrasilia } from "../lib/brasilia.js";

const PROVIDERS = { google: "Google", password: "Email e senha" };

// "Seus dados": o que a conta tem, método de entrada e o que o sistema guarda.
export default function Account() {
  const { user } = useAuth();
  usePageTitle("Seus dados");

  const rows = [
    ["Nome", user.name],
    ["Email", user.email],
    ["Entra com", PROVIDERS[user.provider] ?? user.provider],
    ["Conta criada em", inBrasilia(user.createdAt).format("DD/MM/YYYY")],
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight text-pine-900">Seus dados</h1>

      <section aria-label="Dados da conta" className="rounded-3xl border border-line bg-white p-6">
        <dl className="flex flex-col divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Devices />

      <section aria-label="O que guardamos" className="rounded-3xl border border-line bg-white p-6">
        <DataWeKeep />
        <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
          Exportar os seus dados e excluir a conta ainda não estão disponíveis nesta versão.
        </p>
      </section>
    </div>
  );
}
