import { Outlet } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider.jsx";
import PageFocus from "./components/PageFocus.jsx";

export default function App() {
  return (
    <AuthProvider>
      <PageFocus />
      <Outlet />
    </AuthProvider>
  );
}
