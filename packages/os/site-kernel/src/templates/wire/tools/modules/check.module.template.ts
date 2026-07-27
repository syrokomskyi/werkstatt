/*
<MODULE_CONTRACT>
<purpose>Check module registering lint, validation, and semantic mirror commands for the generated app kernel wiring.</purpose>
<non-goals>
  <item>Do not implement check logic here — delegate to site-kernel-checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: added compass.markup.migrate to extraCommands; updated header to v2 two-block contract.</item>
  <item>RFC-0374: compass.* commands migrated to @webgogol/forge — see packages/forge/os/compass/</item>
</CHANGE_SUMMARY>
*/
import type { KernelModule } from "@gogol/site-kernel";
import {
  createStandardCheckModule,
  runSemanticMirrorValidate,
} from "@gogol/site-kernel-checks";
// compass.* handlers migrated to @webgogol/forge — see packages/forge/os/compass/

export const checkModule: KernelModule = createStandardCheckModule({
  defaultLang: "de",
  extraCommands: [
    {
      name: "semantic.mirror.validate",
      description: "Validate semantic layer mirror integrity.",
      scope: "app",
      supportsAllSites: true,
      flags: {},
      reads: ["<app>/src/content/**/*.md", "packages/os/site-kernel/src/semantic/**"],
      execute: runSemanticMirrorValidate,
    },
  ],
});
