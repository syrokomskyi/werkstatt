import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: [
      resolve(
        __dirname,
        "../../packages/werkstatt-site/src/testing/unit/services/telegram-alert-bridge/**/*.test.ts",
      ),
    ],
  },
  resolve: {
    alias: {
      "@service": resolve(__dirname, "src"),
    },
  },
});
