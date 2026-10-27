import { createBrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { RequireAuth, PublicOnly } from "./components/RouteGuards.jsx";
import AppShell from "./components/AppShell.jsx";
import AuthShell from "./components/AuthShell.jsx";
import Home from "./pages/Home.jsx";
import Signin from "./pages/Signin.jsx";
import Signup from "./pages/Signup.jsx";
import NewTransaction from "./pages/NewTransaction.jsx";
import EditTransaction from "./pages/EditTransaction.jsx";
import Welcome from "./pages/Welcome.jsx";
import Account from "./pages/Account.jsx";
import ErrorPage from "./pages/ErrorPage.jsx";

export const routes = [
  {
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: "/", element: <Home /> },
              { path: "/transaction/:type", element: <NewTransaction /> },
              { path: "/transaction/:id/edit", element: <EditTransaction /> },
              { path: "/account", element: <Account /> },
            ],
          },
          {
            element: <AuthShell />,
            children: [{ path: "/welcome", element: <Welcome /> }],
          },
        ],
      },
      {
        element: <PublicOnly />,
        children: [
          {
            element: <AuthShell />,
            children: [
              { path: "/signin", element: <Signin /> },
              { path: "/signup", element: <Signup /> },
            ],
          },
        ],
      },
      { path: "*", element: <ErrorPage notFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
