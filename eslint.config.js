import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import eslintPluginVue from "eslint-plugin-vue";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import vueParser from "vue-eslint-parser";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";

const eslintrc = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...eslintrc.extends("plugin:vue/vue3-essential"),
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parser: vueParser,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      vue: eslintPluginVue,
    },
    rules: {
      // Catches an identifier that was never imported. The build happily
      // emits those and they only fail at runtime.
      "no-undef": "error",
      "no-console": process.env.NODE_ENV === "production" ? "error" : "warn",
      "no-debugger": process.env.NODE_ENV === "production" ? "error" : "warn",
      "max-len": [
        "error",
        {
          ignoreUrls: true,
        },
      ],
      "prettier/prettier": [
        "error",
        {
          trailingComma: "es5",
          printWidth: 80,
          htmlWhitespaceSensitivity: "ignore",
        },
      ],
      "vue/multi-word-component-names": [
        "error",
        {
          ignores: ["Map"],
        },
      ],
    },
  },
];
