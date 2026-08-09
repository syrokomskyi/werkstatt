/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim for public-surface commands split into public-surface/ (RFC-0303).</purpose>
<non-goals>
  <item>Do not implement command logic here; implementations live in public-surface/*.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Accepted public-readiness RFC implementation: command surface for generated public artifacts and validation gates.</item>
  <item>RFC-0303: split public-surface.ts (1780 lines) into public-surface/{shared,icons,not-found,indexnow,humans,security,aggregate,managed-public}.ts.</item>
</CHANGE_SUMMARY>
*/

export { runPublicIconsGenerate, runPublicIconsValidate } from "./public-surface/icons.ts";
export { runNotFoundGenerate, runNotFoundValidate } from "./public-surface/not-found.ts";
export {
  runIndexNowKeyGenerate,
  runIndexNowKeyValidate,
  runIndexNowSubmit,
  runIndexNowSubmitValidate,
} from "./public-surface/indexnow.ts";
export { runHumansGenerate, runHumansValidate } from "./public-surface/humans.ts";
export {
  runAiPolicyGenerate,
  runAiPolicyValidate,
  runSecurityTxtGenerate,
  runSecurityTxtValidate,
  runHeadersSecurityGenerate,
  runHeadersSecurityValidate,
  runHeadersRuntimeProbe,
} from "./public-surface/security.ts";
export {
  runPublicArtifactGenerate,
  runPublicArtifactValidate,
  runPublicDeclarationValidate,
  runPublicSurfaceLint,
  runPublicRuntimeProbe,
} from "./public-surface/aggregate.ts";
export {
  runPublicManagedClean,
  runPublicOrphansValidate,
  runRedirectMapValidate,
  runDeploySurfaceParityValidate,
} from "./public-surface/managed-public.ts";
