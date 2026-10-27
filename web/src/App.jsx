import { AuthProvider } from "./context/AuthProvider.jsx";
import { ConfigProvider } from "./context/ConfigProvider.jsx";
import AppGate from "./components/AppGate.jsx";

export default function App() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
    </ConfigProvider>
  );
}
