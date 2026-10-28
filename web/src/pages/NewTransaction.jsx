import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { TRANSACTION_TYPES } from "@corewallet/shared";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import TransactionForm from "../components/TransactionForm.jsx";
import { TYPES } from "../lib/transactionTypes.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import { useCategories, createCategory } from "../lib/useCategories.js";

export default function NewTransaction() {
  const { type } = useParams();
  if (!TRANSACTION_TYPES.includes(type)) return <Navigate to="/" replace />;
  return <NewTransactionForm type={type} />;
}

function NewTransactionForm({ type }) {
  const navigate = useNavigate();
  const { expire } = useAuth();
  const [apiError, setApiError] = useState("");
  usePageTitle(TYPES[type].title);
  const categories = useCategories();

  async function onSubmit(data) {
    setApiError("");
    try {
      // O valor segue como o usuário digitou ("12,50"); a API converte em centavos.
      await api.post("/transactions", { ...data, type });
      navigate("/", { state: { notice: "Lançamento salvo." } });
    } catch (error) {
      if (error.response?.status === 401) return expire();
      // Sem resposta (rede caiu ou demorou demais) o servidor pode ter gravado mesmo assim.
      setApiError(
        error.response
          ? getErrorMessage(error)
          : "Não conseguimos confirmar se o lançamento foi salvo. Confira na página inicial antes de tentar de novo."
      );
    }
  }

  return (
    <>
      <TransactionForm key={type} type={type} onSubmit={onSubmit} apiError={apiError} customCategories={categories.list} onCreateCategory={createCategory} />
      {categories.status === "error" && <p className="mx-auto mt-3 max-w-lg text-sm text-muted">Não deu para carregar as suas categorias agora. Só as padrão aparecem.</p>}
    </>
  );
}
