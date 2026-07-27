/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim for ecosystem commands split into ecosystem/ (RFC-0303).</purpose>
<non-goals>
  <item>Do not implement command logic here; implementations live in ecosystem/*.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0245: Add Agent Control Plane generated manifest and maintenance debt ledger command handlers.</item>
  <item>RFC-0246: Derive workspace packages from pnpm-workspace.yaml and emit schema v2 deterministic metadata.</item>
  <item>RFC-0249: Project per-package test signal classification into the Agent Control Plane manifest.</item>
  <item>RFC-0251: Project test policy and maintenance baseline summaries into the Agent Control Plane manifest.</item>
  <item>RFC-0256: Include maintenance debt queue command and plan sources in ACP drift hashes.</item>
  <item>RFC-0245-amendment: Project implemented RFC list with DNA refs and DNA registry into the ACP manifest as a configuration baseline.</item>
  <item>RFC-0303: split ecosystem.ts (936 lines) into ecosystem/{types,manifest,manifest-commands,debt}.ts.</item>
</CHANGE_SUMMARY>
*/

export type { EcosystemManifest, MaintenanceDebtReport } from "./ecosystem/types.ts";
export { buildEcosystemManifest } from "./ecosystem/manifest.ts";
export {
  runEcosystemManifestGenerate,
  runEcosystemManifestValidate,
  runWorkspaceDiscoveryValidate,
  runWorkspaceSurfaceValidate,
} from "./ecosystem/manifest-commands.ts";
export {
  collectMaintenanceDebtItems,
  maintenanceDebtKey,
  normalizeMaintenanceDebtMessage,
  runMaintenanceDebtReport,
} from "./ecosystem/debt.ts";
export { runEcosystemCommit } from "./ecosystem-commit.ts";
export type {
  EcosystemCommitInput,
  EcosystemCommitResult,
  EcosystemCommitViolation,
} from "./ecosystem-commit.ts";
