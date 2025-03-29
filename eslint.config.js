import js from "@eslint/js";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      react: reactPlugin,
      "unused-imports": unusedImports
    },
    rules: {
      // Disable TypeScript-ESLint rules that conflict with our setup
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn", // Downgrade from error to warning
      "@typescript-eslint/ban-ts-comment": "off", // Allow @ts-ignore comments

      // Keep other useful rules
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { "vars": "all", "varsIgnorePattern": "^_", "args": "after-used", "argsIgnorePattern": "^_" }
      ],
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error"
    }
  },
  {
    files: ["**/*.{js,ts,jsx,tsx}"],
    plugins: {
      next: nextPlugin
    },
    rules: nextPlugin.configs.recommended.rules
  }  
];
