/* 
<MODULE_CONTRACT> 
<purpose>Configures Vitest testing environment for Node.js, specifying test file patterns.</purpose> 
 
 
<non-goals> 
  <item>Do not include test execution logic.</item> 
  <item>Do not manage test data or fixtures.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY> 
  <item>Annotate Compass scaffolding for Vitest configuration file.</item> 
</CHANGE_SUMMARY> 
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
