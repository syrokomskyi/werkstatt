/*
<MODULE_CONTRACT>
<purpose>Audience profile validation, audience review run, and audience review validation command handlers for check-warpgogol.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import YAML from "yaml";
import { parseAudienceProfile, parseAudienceReview } from "@warpgogol/check-core";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result.ts";
import { getStringFlag, resolveWorkspacePath } from "../target-io.ts";
import { buildAudienceReview, readEvidenceForRun, updateRunArtifact } from "./helpers.ts";

export async function runCheckAudienceProfileValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const profilePath =
    getStringFlag(input, "profile") ?? "packages/ontology/check-audiences/handwerk-owner-de.yaml";
  try {
    parseAudienceProfile(
      YAML.parse(await context.io.readFile(resolveWorkspacePath(context, profilePath))),
    );
    return diagnosticsResult("check.audience.profile.validate", []);
  } catch (error) {
    return diagnosticsResult("check.audience.profile.validate", [
      {
        ruleId: "CW-AUD-01",
        severity: "error",
        message: "Audience profile is missing or malformed.",
        fixHint: "Provide a YAML profile matching audienceProfileSchema.",
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    ]);
  }
}

export async function runCheckAudienceReviewRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const result = await readEvidenceForRun(input, context);
  if (!result.graph) return diagnosticsResult("check.audience.review.run", result.diagnostics);
  const { graph, runId, runDir, relRunDir } = result;
  const profilePath =
    getStringFlag(input, "profile") ?? "packages/ontology/check-audiences/handwerk-owner-de.yaml";
  const profile = parseAudienceProfile(
    YAML.parse(await context.io.readFile(resolveWorkspacePath(context, profilePath))),
  );
  const reviewPath = join(runDir, "audience-review.json");
  const force = input.flags.force === true;
  if (!force && (await context.io.exists(reviewPath))) {
    const cached = parseAudienceReview(JSON.parse(await context.io.readFile(reviewPath)));
    await context.io.writeFile(
      reviewPath,
      `${JSON.stringify({ ...cached, cached: true }, null, 2)}\n`,
    );
    return diagnosticsResult("check.audience.review.run", []);
  }
  const review = buildAudienceReview(graph, profile, runId);
  await context.io.writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  await updateRunArtifact(context, runDir, relRunDir, { audienceReview: true });
  return diagnosticsResult("check.audience.review.run", []);
}

export async function runCheckAudienceReviewValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const reviewPath = getStringFlag(input, "review");
  if (!reviewPath) {
    return diagnosticsResult("check.audience.review.validate", [
      {
        ruleId: "CW-AUD-02",
        severity: "error",
        message: "Missing required --review path.",
        fixHint: "Pass --review .check-warpgogol/runs/<runId>/audience-review.json.",
      },
    ]);
  }
  try {
    parseAudienceReview(
      JSON.parse(await context.io.readFile(resolveWorkspacePath(context, reviewPath))),
    );
    return diagnosticsResult("check.audience.review.validate", []);
  } catch (error) {
    return diagnosticsResult("check.audience.review.validate", [
      {
        ruleId: "CW-AUD-02",
        severity: "error",
        message: "Audience review artifact is missing or malformed.",
        fixHint: "Run check.audience.review.run again.",
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    ]);
  }
}
