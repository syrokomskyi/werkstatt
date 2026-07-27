/*
<MODULE_CONTRACT>
<purpose>Establishes the configuration for Vitest, enabling a structured testing environment tailored for Node.js applications. It ensures that only relevant test files are included, facilitating efficient test execution.</purpose>
<non-goals>
  <item>Do not handle test execution or result reporting.</item>
  <item>Do not parse or include non-test files in the configuration.</item>
  <item>Do not manage dependencies or external configurations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Annotate Compass scaffolding to enhance clarity and maintainability of the Vitest configuration.</item>
</CHANGE_SUMMARY>
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
