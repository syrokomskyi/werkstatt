/*
<MODULE_CONTRACT>
<purpose>RFC-0171: content.source.validate — guard the Content Source Provider adapter selected in
system.md. Only the filesystem adapter is implemented today; selecting a CMS adapter that is not
yet available fails fast (no silent ship). Phase 1 of the headless-CMS rollout.</purpose>
<non-goals>
  <item>Do not load or run the adapter — this is a selection guard only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0171: initial implementation (Phase 1 — contract + selection guard).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { failResult } from "./result-helpers.ts";

/** Adapters with a working implementation behind the Content Source Provider port. */
const IMPLEMENTED_ADAPTERS = new Set(["fs", "cms-git"]);

export async function runContentSourceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "content.source.validate must run inside an app context." };
  }
  const { manifest } = await loadSystemManifest(join(app.directory, "src", "content"));
  const contentSource = (manifest as unknown as { contentSource?: { adapter?: string } })
    .contentSource;
  const adapter = contentSource?.adapter ?? "fs";

  if (!IMPLEMENTED_ADAPTERS.has(adapter)) {
    return failResult("content.source.validate", [
      `contentSource.adapter "${adapter}" is selected but not yet implemented. ` +
        `Available: ${[...IMPLEMENTED_ADAPTERS].join(", ")}. The "cms-git" (Decap) adapter is live ` +
        `(cms.schema.generate + cms.schema.parity); an API-based adapter follows the same contract (RFC-0171).`,
    ]);
  }
  return { exitCode: 0, summary: `content.source.validate: ok (adapter "${adapter}")` };
}
