/*
<MODULE_CONTRACT>
<purpose>RFC-0828: Playwright configuration for site E2E tests against dev-deployed URLs.
Reads E2E_BASE_URL from env (set by site.e2e.run command handler).</purpose>
<non-goals>
  <item>Does not configure multiple browsers — Chromium only (DNA-66).</item>
  <item>Does not configure CI reporter — E2E tests are dev-channel only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0828: initial Playwright E2E config.</item>
  <item>RFC-0828: add testIgnore for run-e2e-tests.test.ts (vitest unit test).</item>
</CHANGE_SUMMARY>
*/

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testIgnore: ["run-e2e-tests.test.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  reporter: process.env.E2E_JSON_OUTPUT
    ? [["json", { outputFile: process.env.E2E_JSON_OUTPUT }]]
    : "list",
});
