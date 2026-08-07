/*
<MODULE_CONTRACT>
  <purpose>RFC-0355: Bordbuch barrel — re-exports command handlers and utilities. Module registration lives in bordbuch.module.ts.</purpose>
  <non-goals>
    <item>Do not define createBordbuchModule here — that lives in bordbuch.module.ts.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0626: remove stale createBordbuchModule duplicate — bordbuch.module.ts is the single registration source.</item>
  <item>RFC-0626: add barrel exports for bordbuch.commit.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export { runBordbuchAppend, type BordbuchAppendData } from "./bordbuch-append.ts";
export { runBordbuchValidate, type BordbuchValidateData } from "./bordbuch-validate.ts";
export { runBordbuchStatus, type BordbuchStatusData } from "./bordbuch-status.ts";
export { runBordbuchGenerate } from "./bordbuch-generate.ts";
export {
  runBordbuchRepair,
  type BordbuchRepairResult,
  type BordbuchRepairOrphan,
} from "./bordbuch-repair.ts";
export {
  runBordbuchCommit,
  commitBordbuchProjections,
  type BordbuchCommitResult,
} from "./bordbuch-commit.ts";
export {
  appendBordbuchEntry,
  readBordbuch,
  validateWriterRole,
  commitAndPushBordbuch,
  computeEntryHash,
  DEPRECATED_KIND_MIGRATIONS,
  migrateDeprecatedKind,
  type BordbuchViolation,
  type CommitAndPushResult,
} from "./bordbuch-io.ts";

export { createBordbuchModule } from "./bordbuch.module.ts";
