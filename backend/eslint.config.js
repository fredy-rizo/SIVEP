// Configuración de ESLint (flat config, ESLint 9) para el backend.
// Reglas mínimas orientadas a detectar errores reales (variables no usadas,
// identificadores indefinidos, código inalcanzable), sin imponer estilo.
export default [
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_|^e$|^err$" }],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
    },
  },
  {
    ignores: ["node_modules/**", "uploads/**", "dist/**"],
  },
];
