import { useAuth } from "../context/authContext.js";
import DataWeKeep from "../components/DataWeKeep.jsx";
import Devices from "../components/Devices.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";
import { inBrasilia } from "../lib/brasilia.js";

const PROVIDERS = { google: "Google", password: "Email e senha" };

// "Minha conta": o que a conta tem, método de entrada e o que o sistema guarda.
export default function Account() {
  const { user } = useAuth();
  usePageTitle("Minha conta");

  const rows = [
    ["Nome", user.name],
    ["Email", user.email],
    ["Entra com", PROVIDERS[user.provider] ?? user.provider],
    ["Conta criada em", inBrasilia(user.createdAt).format("DD/MM/YYYY")],
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Minha conta" subtitle={user.email} />

      <section aria-label="Dados da conta" className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
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

      <section aria-label="O que guardamos" className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
        <DataWeKeep />
      </section>
    </div>
  );
}
