import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // page.evaluate roda código no navegador (document, window).
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
