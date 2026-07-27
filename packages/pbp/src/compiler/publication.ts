/*
<MODULE_CONTRACT>
<purpose>Phase 14: Assembles the final PbpCompilerResult from all phase outputs.</purpose>
<non-goals>
  <item>Does not implement individual phases — each phase has its own module.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 14: publication.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import type { PbpBuildContext } from "../compiler-pipeline.js";
import type { PbpPublicationSnapshot } from "../publication.js";
import type {
  PbpCompilerInput,
  PbpCompilerResult,
  PbpResolvedGraph,
  PbpProjectionSet,
  PbpBuyerView,
  PartialCompilerResult,
} from "./types.js";
import type { PbpSourceInventoryReport } from "../compiler-pipeline.js";
import type { PbpEntity } from "../envelope.js";
import type { PbpFallbackReport } from "../locale.js";
import type { PbpGraphIntegrityError, PbpCycleCheckResult } from "../reference-resolution.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpDerivationResult } from "../derivation.js";
import { byteHash } from "@warpgogol/fingerprint";

export async function publish(
  partial: PartialCompilerResult,
  input: PbpCompilerInput,
): Promise<PbpCompilerResult> {
  const context = buildContext(input, partial);

  return {
    context,
    inventory: partial.inventory ?? { sources: [], recordsDiscovered: 0, recordsBySchema: {} },
    entityIndex: partial.entityIndex ?? new Map<string, PbpEntity>(),
    resolvedGraph: partial.resolvedGraph ?? emptyGraph(),
    fallbackReport: partial.fallbackReport ?? { locale: input.locale, fallbacks: [] },
    graphErrors: partial.graphErrors ?? [],
    cycleResults: partial.cycleResults ?? [],
    validationErrors: partial.validationErrors ?? [],
    derivationResults: partial.derivationResults ?? [],
    buyerView: partial.buyerView,
    projections: partial.projections ?? { website: [], aiAnswer: [], schemaOrg: {} },
    publication: partial.publication,
  };
}

function buildContext(input: PbpCompilerInput, partial: PartialCompilerResult): PbpBuildContext {
  const sourceRevision = getGitRevision(input.sourceDirectory);
  const schemaSetDigest = byteHash("pbp-schema-set-v1");
  const derivationSetDigest = byteHash(
    (input.derivations ?? [])
      .map((d) => d.derivationRef)
      .sort()
      .join(","),
  );

  return {
    buildId: byteHash(`${sourceRevision}:${input.locale}:${input.strictness}`),
    sourceRevision,
    buildTime: input.buildTime ?? new Date().toISOString(),
    locale: input.locale,
    defaultLocale: input.defaultLocale,
    schemaSetDigest,
    derivationSetDigest,
    runtimeSnapshotId: null,
  };
}

function getGitRevision(sourceDirectory: string): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: sourceDirectory,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    return "unknown";
  }
}

function emptyGraph(): PbpResolvedGraph {
  return {
    business: {} as PbpResolvedGraph["business"],
    places: {},
    contactPoints: {},
    webPresences: {},
    products: {},
    categories: {},
    catalogEntries: {},
    offerings: {},
    policies: {},
    claims: {},
    evidenceSources: {},
    disclosures: {},
    publicDocuments: {},
  };
}
