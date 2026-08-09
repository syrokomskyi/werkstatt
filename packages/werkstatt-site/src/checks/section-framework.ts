/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim over section-framework/* (RFC-0303 split): the RFC-0111
static validator suite for the RFC-0101..RFC-0106 section framework.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split into section-framework/{shell,background,header,body,cta,image,motion,site-background,orchestrator,shared}.ts; this file is now a thin re-export shim so existing "./section-framework.ts" imports keep working unchanged.</item>
</CHANGE_SUMMARY>
*/

export { runSectionShellContractValidate } from "./section-framework/shell.ts";
export { runSectionBackgroundContractValidate } from "./section-framework/background.ts";
export { runSectionHeaderContractValidate } from "./section-framework/header.ts";
export { runSectionBodyContractValidate } from "./section-framework/body.ts";
export { runSectionCtaContractValidate } from "./section-framework/cta.ts";
export { runSectionImageContractValidate } from "./section-framework/image.ts";
export { runSectionMotionContractValidate } from "./section-framework/motion.ts";
export { runSiteBackgroundContractValidate } from "./section-framework/site-background.ts";
export { runLayoutOrchestratorLint } from "./section-framework/orchestrator.ts";
export { runSectionCssImportValidate } from "./section-framework/css-import.ts";
