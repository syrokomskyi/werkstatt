/*
<MODULE_CONTRACT>
<purpose>
app.contract.full — composite readiness command that runs every architectural
validator from RFC-0023 through RFC-0028 in dependency order and aggregates
results into a single pass/fail signal (DNA-35, RFC-0029).

This command is NOT in SITES_CHECK_PIPELINE — it is a meta-command that
composes the pipeline validators. It is the canonical CI gate for "is this
app ready to deploy?"
</purpose>
<non-goals>
  <item>Do not include slow CI-only commands (lighthouse.validate, lighthouse.budget.check).</item>
  <item>Do not include codegen/prepare commands (open-source.generate, icons.generate, uni.registry.build).</item>
  <item>Do not replace SITES_CHECK_PIPELINE — that runs per build step; this runs as the final gate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0029): Initial creation.</item>
  <item>Fix (RFC-0029 review): Use canonical KernelCommandResult shape; sub-dispatch via executeKernelCommand.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { executeKernelCommand } from "@warpgogol/site-kernel";

// The closed set of validators that form the "full contract" for an RFC-0023..0028 compliant app.
// Ordered: structural → naming → content → growth → passport.
// Additions from future RFCs should be appended here AND in architecture-dna.md.
export const CONTRACT_FULL_VALIDATORS: readonly string[] = Object.freeze([
  // RFC-0023: Uni UI Ontology
  "manifest.contract.validate",
  "mirror.quintet.validate",
  "uni.registry.validate",
  // RFC-0025: Cosmic overlay + feature-first layout
  "app.layout.validate",
  "system.manifest.validate",
  "biome.contract.validate",
  "cosmic.catalog.validate",
  "cosmic.name.unique",
  "constellation.compose.validate",
  "client.edit.validate",
  // RFC-0026: Block-declarative pages + RuntimeContext
  "page.block.validate",
  "visibility.expr.validate",
  "page.pipeline.contract",
  "runtime.context.shape",
  // RFC-0027: Growth layer
  "growth.events.validate",
  "growth.funnel.validate",
  "growth.experiment.validate",
  "growth.experiment.archive",
  "growth.adapter.contract",
  "growth.vendor.resolve",
  // RFC-0028: Cosmic Passport
  "nebula.score.compute",
  "star-map.render",
  "passport.emit",
  "passport.verify",
  // Structural + naming (architecture baseline)
  "naming.convention.lint",
  "feature.graph.validate",
  // Content quality
  "content.validate",
  "thin-copy.validate",
  "tokens.ds.lint",
  "tokens.colors.lint",
  // RFC-0049: Sitemap hreflang validation
  "sitemap.validate",
  // RFC-0050: LLMS text file validation
  "llms.validate",
  // RFC-0074: composite audit gate
  "app.qa.validate",
]);

export interface SubResult {
  command: string;
  ok: boolean;
  exitCode: number;
  summary?: string;
}

export interface ContractFullData {
  command: "app.contract.full";
  app: string;
  subResults: SubResult[];
  summary: { ok: number; fail: number; skipped: number };
}

/**
 * runAppContractFull — execute every CONTRACT_FULL_VALIDATORS entry against the
 * named app via the public executeKernelCommand entrypoint.
 *
 * Each sub-validator runs as an independent kernel invocation, sharing the
 * workspace root and app name with this command.
 */
export async function runAppContractFull(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ContractFullData>> {
  const app = context.site?.name ?? (input.flags["app"] as string | undefined);
  if (!app) {
    return {
      data: {
        command: "app.contract.full",
        app: "unknown",
        subResults: [],
        summary: { ok: 0, fail: 1, skipped: 0 },
      },
      exitCode: 1,
      summary: "app.contract.full: app not resolved (use --site <name>)",
    };
  }

  // Deduplicate (mirror.quintet.validate could appear in the list twice in future)
  const seen = new Set<string>();
  const validators = CONTRACT_FULL_VALIDATORS.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });

  const subResults: SubResult[] = [];
  let hasFailure = false;

  for (const validatorName of validators) {
    try {
      const report = await executeKernelCommand({
        workspaceRoot: context.workspaceRoot,
        commandName: validatorName,
        siteName: app,
        siteExplicit: true,
        outputFormat: "json",
        dryRun: false,
      });
      // executeKernelCommand returns a single report (since allApps is undefined)
      const single = Array.isArray(report) ? report[0] : report;
      const ok = single?.ok ?? false;
      if (!ok) hasFailure = true;
      subResults.push({
        command: validatorName,
        ok,
        exitCode: single?.exitCode ?? 1,
        summary: single?.summary,
      });
    } catch (err) {
      hasFailure = true;
      subResults.push({
        command: validatorName,
        ok: false,
        exitCode: 1,
        summary: `ACF-ERR: ${(err as Error).message}`,
      });
    }
  }

  const ok = subResults.filter((r) => r.ok).length;
  const fail = subResults.filter((r) => !r.ok).length;

  // Pretty-print summary to stdout
  const lines = [
    "",
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║  app.contract.full                                                   ║",
    `║  App: ${app.padEnd(63)}║`,
    "╠══════════════════════════════════════════════════════════════════════╣",
    ...subResults.map((r) => {
      const icon = r.ok ? "✅" : "❌";
      const name = r.command.padEnd(45);
      return `║  ${icon} ${name}                        ║`;
    }),
    "╠══════════════════════════════════════════════════════════════════════╣",
    `║  ✅ ${String(ok).padEnd(3)} passed   ❌ ${String(fail).padEnd(3)} failed                                ║`,
    "╚══════════════════════════════════════════════════════════════════════╝",
    "",
  ];
  console.log(lines.join("\n"));

  return {
    data: {
      command: "app.contract.full",
      app,
      subResults,
      summary: { ok, fail, skipped: 0 },
    },
    exitCode: hasFailure ? 1 : 0,
    summary: hasFailure
      ? `app.contract.full: ${fail} validator(s) failed`
      : `app.contract.full: all ${ok} validators passed`,
  };
}
