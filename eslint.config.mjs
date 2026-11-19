import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**", "*.log"],
  },
  {
    // Server-only modules must never be imported by client components.
    files: ["src/components/**/*.tsx", "src/app/**/*-client.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/*", "firebase-admin", "firebase-admin/*"], message: "Server code cannot be imported into components.", allowTypeImports: true }] },
      ],
    },
  },
];

export default config;
