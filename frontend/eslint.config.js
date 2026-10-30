// Configuración de ESLint (flat config, ESLint 9) para el frontend.
// Sin plugins externos: solo reglas del núcleo que detectan errores reales.
// `ecmaFeatures.jsx` habilita JSX; las variables en mayúsculas (componentes)
// se ignoran en no-unused-vars porque ESLint core no las marca como usadas
// al aparecer solo dentro de JSX.
export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        File: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        Intl: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        confirm: "readonly",
        alert: "readonly",
        navigator: "readonly",
        location: "readonly",
        history: "readonly",
        event: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^[A-Z_]", caughtErrorsIgnorePattern: "^_|^e$|^err$" }],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
