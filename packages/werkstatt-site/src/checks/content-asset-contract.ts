/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0248] Focused content asset contract validator. It verifies that authored asset
  tokens are checked through the shared @warpgogol/werkstatt-site/content-source candidate-generation contract
  before downstream material-credit validation runs.
</purpose>
<non-goals>
  <item>Do not implement independent filesystem lookup logic.</item>
  <item>Do not validate material credit sidecars; RFC-0220 commands own that contract.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0248: add focused resolver/validator contract command.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { assetReferenceDiagnostics, collectAssetReferenceFindings } from "./asset-reference.ts";
import { diagnosticsResult } from "./result-helpers.ts";

export async function runContentAssetContractValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.asset.contract.validate";
  const diagnostics = assetReferenceDiagnostics(await collectAssetReferenceFindings(ctx)).map(
    (diagnostic) => ({
      ...diagnostic,
      ruleId: "content.asset.contract.validate",
    }),
  );
  return diagnosticsResult(command, diagnostics);
}
