import { useEffect, useState } from "react";
import { api } from "./api.js";

// Categorias criadas pela pessoa. As de fábrica vêm do pacote shared.
// status: loading | ready | error. Quem usa não precisa esperar: sem a lista, só as de fábrica aparecem.
export function useCategories() {
  const [state, setState] = useState({ status: "loading", list: [] });
  useEffect(() => {
    let cancelled = false;
    api
      .get("/categories")
      .then((res) => !cancelled && setState({ status: "ready", list: res.data.categories }))
      .catch(() => !cancelled && setState({ status: "error", list: [] }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export async function createCategory(input) {
  return (await api.post("/categories", input)).data;
}
