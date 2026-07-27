/*
<MODULE_CONTRACT>
<purpose>RFC-0240: trust.rating.validate — forbid aggregateRating on Bodenstation; require CKL-provenance on Sternsystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0240: add trust rating validation for Bodenstation aggregateRating restrictions.</item>
  <item>RFC-0240: add the Sternsystem branch — aggregateRating requires a CKL claim (provenance: external + validity window) on a rating/review field.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";

async function* walkContentFiles(dir: string): AsyncGenerator<string> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkContentFiles(path);
    } else if (e.name.endsWith(".md") || e.name.endsWith(".yaml") || e.name.endsWith(".yml")) {
      yield path;
    }
  }
}

/** A minimal claim annotation shape, tolerant of the full recordClaims schema (RFC-0212). */
interface MinimalClaimAnnotation {
  provenance?: string;
  validity?: { asOf?: string };
}

/** RFC-0211/0212/0240: field paths that plausibly back a rating/review claim. */
const RATING_FIELD_PATTERN = /rating|review/i;

/**
 * Sternsystem: `aggregateRating` requires a CKL claim (RFC-0211/0212) on a rating/review field with
 * `provenance: external` and a validity window (`asOf`) — real, provenance-backed reviews, never
 * asserted/generated. Reads the record's sibling `<record>.claims.yaml` sidecar.
 */
async function hasProvenancedRatingClaim(recordFile: string): Promise<boolean> {
  const sidecarPath = recordFile.replace(/\.(md|ya?ml)$/, ".claims.yaml");
  if (sidecarPath === recordFile) return false;
  let raw: string;
  try {
    raw = await readFile(sidecarPath, "utf8");
  } catch {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") return false;
  return Object.entries(parsed as Record<string, MinimalClaimAnnotation>).some(
    ([fieldPath, annotation]) =>
      RATING_FIELD_PATTERN.test(fieldPath) &&
      annotation?.provenance === "external" &&
      Boolean(annotation?.validity?.asOf),
  );
}

export async function runTrustRatingValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "trust.rating.validate must run inside an app context." };
  }

  const violations: string[] = [];

  // Determine mode: read business company profile
  let isBodenstation = false;
  for (const lang of ["de", "uk"]) {
    try {
      const raw = await readFile(
        join(app.directory, "src", "content", "business", lang, "company.md"),
        "utf8",
      );
      const modeMatch = raw.match(/mode:\s*(\w+)/);
      if (modeMatch && modeMatch[1] === "bodenstation") {
        isBodenstation = true;
        break;
      }
    } catch {
      // no-op
    }
  }

  const contentDir = join(app.directory, "src", "content");

  if (isBodenstation) {
    // Bodenstation: aggregateRating is forbidden outright — the studio is not the local provider.
    for await (const file of walkContentFiles(contentDir)) {
      const text = await readFile(file, "utf8");
      if (/aggregateRating/i.test(text)) {
        const rel = file.replace(app.directory, "").replace(/^\\/, "");
        violations.push(
          `rating-on-bodenstation: "${rel}" contains aggregateRating — forbidden in Bodenstation mode (studio is not the local provider)`,
        );
      }
    }
  } else {
    // Sternsystem: aggregateRating is allowed only with a provenance-backed real-review CKL claim.
    for await (const file of walkContentFiles(contentDir)) {
      if (!file.endsWith(".md")) continue;
      const text = await readFile(file, "utf8");
      if (!/aggregateRating/i.test(text)) continue;
      const rel = file.replace(app.directory, "").replace(/^\\/, "");
      if (!(await hasProvenancedRatingClaim(file))) {
        violations.push(
          `unsourced-rating: "${rel}" contains aggregateRating but has no provenance-backed real-review CKL claim (need provenance: external + a validity window on a rating/review field)`,
        );
      }
    }
  }

  if (violations.length > 0) {
    return failResult("trust.rating.validate", violations);
  }
  return passResult(
    "trust.rating.validate",
    isBodenstation
      ? "ok (no aggregateRating in Bodenstation mode)"
      : "ok (every aggregateRating is provenance-backed)",
  );
}
