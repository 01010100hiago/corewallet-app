import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Em desenvolvimento o front chama /api no próprio endereço,
    // igual em produção, onde o nginx encaminha /api para a API.
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  build: {
    // ~560 kB (177 kB com gzip): React, roteador, Zod e Axios. As telas são pequenas,
    // então dividir por rota quase não reduz nada; o limite sobe para não gerar ruído.
    chunkSizeWarningLimit: 650,
  },
  // O preview (usado nos testes de ponta a ponta) encaminha /api como o nginx faz.
  preview: {
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    globals: false,
    restoreMocks: true,
  },
});
