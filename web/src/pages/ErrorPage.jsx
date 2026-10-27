import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { LinkButton } from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import { usePageTitle } from "../lib/usePageTitle.js";

// Usada de dois jeitos: como errorElement (erro de rota ou de render) e como
// página da rota "*" (endereço que não existe), onde se passa notFound.
export default function ErrorPage({ notFound: forcedNotFound = false }) {
  const error = useRouteError();
  const notFound = forcedNotFound || (isRouteErrorResponse(error) && error.status === 404);
  usePageTitle(notFound ? "Página não encontrada" : "Algo deu errado");

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-line bg-white p-8 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-coral-100 text-coral-800">
          <Icon name="aviso" className="size-9" />
        </span>
        <p className="text-6xl font-semibold text-pine-900">{notFound ? "404" : "Ops"}</p>
        <h1 className="text-xl font-medium">{notFound ? "Página não encontrada" : "Algo deu errado por aqui"}</h1>
        <p className="text-muted">{notFound ? "O endereço não existe ou mudou de lugar." : "Tente voltar ao início. Se continuar, avise a gente."}</p>
        <div className="w-full">
          <LinkButton to="/" variant="pine">
            Voltar ao início
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
