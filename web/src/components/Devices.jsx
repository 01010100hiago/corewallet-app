import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { api, getErrorMessage } from "../lib/api.js";
import { useAuth } from "../context/authContext.js";
import Icon from "./Icon.jsx";
import { Button } from "./Button.jsx";
import ErrorMessage from "./ErrorMessage.jsx";

const when = (iso) => dayjs(iso).format("DD/MM/YYYY [às] HH:mm");

// Lista onde a conta está aberta e deixa encerrar cada sessão. O que aparece vem
// direto da API (sessões que existem no servidor), não de uma estimativa do front.
export default function Devices() {
  const { logoutAll } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setList((await api.get("/auth/sessions")).data);
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/sessions")
      .then((res) => !cancelled && setList(res.data))
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(device) {
    setError("");
    setBusy(device.id);
    try {
      await api.delete(`/auth/sessions/${device.id}`);
      setList((current) => current.filter((d) => d.id !== device.id));
    } catch (err) {
      // 404: a sessão já tinha acabado; a lista só estava desatualizada.
      if (err.response?.status === 404) await load();
      else setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function leaveEverywhere() {
    setError("");
    setBusy("all");
    try {
      await logoutAll();
      navigate("/signin", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="devices-title" className="rounded-3xl border border-line bg-white p-6">
      <h2 id="devices-title" className="font-semibold text-pine-900">
        Aparelhos conectados
      </h2>
      <p className="mt-1 text-sm text-muted">
        Cada linha é uma sessão aberta na sua conta. Se não reconhecer uma, encerre.
      </p>

      {loadError && (
        <div className="mt-4 flex flex-col gap-3">
          <ErrorMessage>{loadError}</ErrorMessage>
          <Button variant="soft" icon="renovar" onClick={load}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!loadError && list === null && (
        <p role="status" className="mt-4 text-sm text-muted">
          Carregando aparelhos…
        </p>
      )}

      {list && (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0">
              <Icon name={d.device.kind === "phone" ? "celular" : "computador"} className="size-6 shrink-0 text-pine-900" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {d.device.label}
                  {d.current && <span className="ml-2 rounded-full bg-mint-100 px-2 py-0.5 text-xs font-semibold text-pine-900">Este aparelho</span>}
                </p>
                <p className="text-sm text-muted">
                  Último uso em {when(d.lastUsedAt)}
                  {d.ip && <> · IP {d.ip}</>}
                </p>
                <p className="text-sm text-muted">Sessão termina em {dayjs(d.expiresAt).format("DD/MM/YYYY")}</p>
              </div>
              {!d.current && (
                <button
                  type="button"
                  onClick={() => revoke(d)}
                  disabled={busy !== ""}
                  aria-label={`Encerrar sessão em ${d.device.label}`}
                  className="h-10 shrink-0 rounded-xl px-3 text-sm font-semibold text-coral-800 transition hover:bg-coral-100 disabled:opacity-60"
                >
                  Encerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-4">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      )}

      {list && (
        <div className="mt-5 border-t border-line pt-5">
          <Button variant="soft" icon="sair" onClick={leaveEverywhere} disabled={busy !== ""}>
            Sair de todos os aparelhos
          </Button>
        </div>
      )}
    </section>
  );
}
