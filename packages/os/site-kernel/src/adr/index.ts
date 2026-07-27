/*
<MODULE_CONTRACT>
<purpose>
Re-export barrel for the ADR domain. The ADR module has migrated to
@webgogol/forge/os/adr (RFC-0521). This file preserves the
@gogol/site-kernel/adr import path for backward compatibility.
</purpose>
<non-goals>
  <item>Do not re-implement ADR logic here — all logic lives in @webgogol/forge/os/adr.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0366: expose adrModule and ADR types from the ADR domain.</item>
  <item>RFC-0521: replaced site-kernel ADR implementation with re-export from @webgogol/forge/os/adr.</item>
</CHANGE_SUMMARY>
*/

export {
  forgeAdrModule as adrModule,
  runAdrList,
  runAdrCreate,
  runAdrValidate,
  runAdrArchive,
} from "@webgogol/forge/os/adr";
export type {
  AdrArchiveResult,
  AdrArchiveMove,
  AdrArchiveSkip,
  AdrStatus,
  AdrScope,
  AdrFrontmatter,
  AdrListEntry,
  AdrListResult,
  AdrCreateResult,
  AdrValidationViolation,
  AdrValidationResult,
} from "@webgogol/forge/os/adr";
export {
  ADR_STATUSES,
  ADR_SCOPES,
  ADR_DIR,
  ADR_TEMPLATE_FILE,
  ADR_ID_PATTERN,
} from "@webgogol/forge/os/adr";
