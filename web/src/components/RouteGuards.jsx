import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/authContext.js";

// Só entra quem está logado; os outros vão para o login. Quem entrou pelo Google
// pela primeira vez só passa depois de completar o perfil (nome).
export function RequireAuth() {
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  if (status !== "authenticated") return <Navigate to="/signin" replace />;
  if (user.profileComplete === false && pathname !== "/welcome") return <Navigate to="/welcome" replace />;
  if (user.profileComplete !== false && pathname === "/welcome") return <Navigate to="/" replace />;
  return <Outlet />;
}

// Login e cadastro não fazem sentido para quem já está logado.
export function PublicOnly() {
  const { status } = useAuth();
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}
