import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "astro:content": fileURLToPath(new URL("./src/astro-content-stub.ts", import.meta.url)),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/testing/e2e/**/*.test.ts",
      "src/testing/unit/services/**/*.test.ts",
    ],
    environment: "happy-dom",
  },
});
