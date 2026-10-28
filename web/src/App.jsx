import { AuthProvider } from "./context/AuthProvider.jsx";
import { ConfigProvider } from "./context/ConfigProvider.jsx";
import AppGate from "./components/AppGate.jsx";
import { PrivacyProvider } from "./context/PrivacyProvider.jsx";

export default function App() {
  return (
    <PrivacyProvider>
      <ConfigProvider>
        <AuthProvider>
          <AppGate />
        </AuthProvider>
      </ConfigProvider>
    </PrivacyProvider>
  );
}
