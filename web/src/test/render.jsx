import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../context/authContext.js";

export const fakeAuth = (overrides = {}) => ({
  user: { id: "1", name: "Maria Silva", email: "maria@exemplo.com" },
  session: { startedAt: "2026-10-27T14:32:00.000Z", expiresAt: "2026-10-27T15:32:00.000Z", serverTime: "2026-10-27T14:40:00.000Z" },
  status: "authenticated",
  notice: null,
  now: () => Date.now(),
  retry: () => {},
  signin: async () => {},
  signup: async () => {},
  logout: async () => {},
  expire: () => {},
  ...overrides,
});

// Mostra a tela dentro de um roteador de teste; "/" mostra um marcador para
// podermos conferir quando a tela redireciona.
export function renderPage(ui, { path = "/", route = path, auth = fakeAuth() } = {}) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/" element={<p>página inicial</p>} />
          <Route path="/signin" element={<p>página de login</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}
