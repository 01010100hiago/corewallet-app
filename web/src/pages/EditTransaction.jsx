import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/authContext.js";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "../components/Icon.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import TransactionForm from "../components/TransactionForm.jsx";
import { TYPES } from "../lib/transactionTypes.js";
import { usePageTitle } from "../lib/usePageTitle.js";
import { centsToInput } from "../lib/money.js";
import { useCategories, createCategory } from "../lib/useCategories.js";

export default function EditTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { expire } = useAuth();
  // { id, transaction } | { id, error, notFound }: o id diz a qual lançamento a resposta pertence.
  const [loaded, setLoaded] = useState(null);
  const [apiError, setApiError] = useState("");
  const categories = useCategories();
  const current = loaded?.id === id ? loaded : null;
  usePageTitle(current?.transaction ? TYPES[current.transaction.type].editTitle : "Editar lançamento");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/transactions/${id}`)
      .then((res) => !cancelled && setLoaded({ id, transaction: res.data }))
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) return expire();
        setLoaded({ id, error: err.response?.status === 404 ? "Não encontramos este lançamento. Ele pode ter sido excluído." : getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [id, expire]);

  async function onSubmit(data) {
    setApiError("");
    try {
      await api.put(`/transactions/${id}`, data);
      navigate("/", { state: { notice: "Lançamento atualizado." } });
    } catch (error) {
      if (error.response?.status === 401) return expire();
      setApiError(
        error.response
          ? getErrorMessage(error)
          : "Não conseguimos confirmar se a alteração foi salva. Confira na página inicial antes de tentar de novo."
      );
    }
  }

  if (!current) {
    return (
      <p role="status" className="py-12 text-center text-muted">
        Carregando lançamento…
      </p>
    );
  }

  if (current.error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Link to="/" className="inline-flex items-center gap-2 rounded-md py-1 text-sm font-medium text-pine-900 hover:text-pine-700">
          <Icon name="voltar" className="size-5" />
          Voltar
        </Link>
        <ErrorMessage>{current.error}</ErrorMessage>
      </div>
    );
  }

  const t = current.transaction;
  return (
    <TransactionForm
      key={t.id}
      type={t.type}
      editing
      initial={{ value: centsToInput(t.value), description: t.description, category: t.category }}
      onSubmit={onSubmit}
      apiError={apiError}
      customCategories={categories.list}
      onCreateCategory={createCategory}
    />
  );
}
