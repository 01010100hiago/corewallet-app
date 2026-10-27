import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/authContext.js";
import { Button } from "./Button.jsx";
import Icon from "./Icon.jsx";

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <p role="status" className="text-muted">
        Carregando…
      </p>
    </div>
  );
}

function ConnectionProblem() {
  const { retry } = useAuth();
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-line bg-white p-8 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-coral-100 text-coral-800">
          <Icon name="aviso" className="size-9" />
        </span>
        <h1 className="text-xl font-medium">Não foi possível conectar ao servidor</h1>
        <p className="text-muted">Sua sessão continua guardada. Confira a internet e tente de novo.</p>
        <div className="w-full">
          <Button variant="pine" icon="renovar" onClick={retry}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </main>
  );
}

// Só entra quem está logado; os outros vão para o login.
export function RequireAuth() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  if (status === "error") return <ConnectionProblem />;
  if (status === "anonymous") return <Navigate to="/signin" replace />;
  return <Outlet />;
}

// Login e cadastro não fazem sentido para quem já está logado.
export function PublicOnly() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  if (status === "error") return <ConnectionProblem />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}
