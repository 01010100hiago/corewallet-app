import axios from "axios";

// O front e a API ficam no mesmo endereço: /api. Em desenvolvimento o Vite
// encaminha para a porta 4000. O cookie de sessão é httpOnly, então o
// JavaScript da página nunca enxerga o token.
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
});

// Transforma qualquer erro do Axios numa frase para mostrar na tela.
export function getErrorMessage(error) {
  if (error?.response) {
    const { message, errors } = error.response.data ?? {};
    const first = errors && Object.values(errors)[0];
    return first || message || "Algo deu errado. Tente de novo.";
  }
  if (error?.code === "ECONNABORTED") return "O servidor demorou para responder.";
  return "Não foi possível conectar ao servidor.";
}
