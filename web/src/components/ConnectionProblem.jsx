import { Button } from "./Button.jsx";
import Icon from "./Icon.jsx";

export default function ConnectionProblem({ onRetry }) {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-line bg-white p-8 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-coral-100 text-coral-800">
          <Icon name="aviso" className="size-9" />
        </span>
        <h1 className="text-xl font-medium">Não foi possível conectar ao servidor</h1>
        <p className="text-muted">Sua sessão continua guardada. Confira a internet e tente de novo.</p>
        <div className="w-full">
          <Button variant="pine" icon="renovar" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </main>
  );
}
