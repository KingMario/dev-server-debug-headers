const browserGlobals = {
  Blob: "readonly",
  URL: "readonly",
  alert: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  document: "readonly",
  setTimeout: "readonly",
};

const chromeGlobals = {
  chrome: "readonly",
};

const nodeTestGlobals = {
  console: "readonly",
};

const sharedRules = {
  "array-callback-return": "error",
  "block-scoped-var": "error",
  curly: ["error", "all"],
  eqeqeq: ["error", "always"],
  "no-console": "off",
  "no-constant-condition": "error",
  "no-debugger": "error",
  "no-duplicate-imports": "error",
  "no-else-return": "error",
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-implicit-globals": "error",
  "no-multi-assign": "error",
  "no-redeclare": "error",
  "no-shadow": "warn",
  "no-undef": "error",
  "no-unreachable": "error",
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
  "object-shorthand": ["error", "always"],
  "prefer-const": "error",
  "sort-imports": [
    "error",
    {
      ignoreDeclarationSort: false,
      ignoreMemberSort: false,
    },
  ],
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...browserGlobals,
        ...chromeGlobals,
      },
    },
    rules: sharedRules,
  },
  {
    files: ["test/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeTestGlobals,
    },
    rules: sharedRules,
  },
];
