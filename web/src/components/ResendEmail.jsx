import { useState } from "react";
import { api, getErrorMessage } from "../lib/api.js";
import Icon from "./Icon.jsx";

// Pede um novo link de confirmação. A resposta é sempre a mesma, exista a conta ou não.
export default function ResendEmail({ email }) {
  const [state, setState] = useState({ status: "idle" }); // idle | sending | done | error

  async function resend() {
    setState({ status: "sending" });
    try {
      const res = await api.post("/auth/email/resend", { email });
      setState({ status: "done", message: res.data.message });
    } catch (err) {
      setState({ status: "error", message: getErrorMessage(err) });
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 text-sm">
      <button
        type="button"
        onClick={resend}
        disabled={state.status === "sending"}
        className="w-fit rounded-md px-1 py-0.5 font-medium text-pine-900 underline underline-offset-4 hover:text-pine-700 disabled:opacity-60"
      >
        {state.status === "sending" ? "Enviando…" : "Reenviar o email de confirmação"}
      </button>
      {state.status === "done" && (
        <p role="status" className="flex items-center gap-2 text-pine-900">
          <Icon name="ok" className="size-4 shrink-0" />
          {state.message}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-negative">
          {state.message}
        </p>
      )}
    </div>
  );
}
