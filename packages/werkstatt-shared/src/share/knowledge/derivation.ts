/*
<MODULE_CONTRACT>
<purpose>
RFC-0215: derived-content staleness. A translation/copy is a `derived` claim that
remembers which source it came from (derivedFrom) and a normalized hash of that
source at derivation time (sourceHash). When the source changes, the stored hash
no longer matches → the derivative is `outdated`. Framework-free hashing + compare,
shared with the enriched-content frozen-provenance model (RFC-0197/0207).
</purpose>
<non-goals>
  <item>Do not read the filesystem or parse sidecars — the kernel command does that.</item>
  <item>Do not translate or regenerate content — only detect staleness.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0215: initial normalized hasher + state compare.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";

export type DerivedState = "current" | "outdated" | "source-missing";

/**
 * Normalize a source value so cosmetic edits (whitespace reflow, markdown emphasis)
 * do not falsely mark a derivative outdated, while wording/number changes do.
 * Whitespace is collapsed; common markdown punctuation is stripped; result trimmed.
 */
export function normalizeForHash(value: string): string {
  return value
    .replace(/[*_`~#>]/g, "")
    .replace(/[[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hash a value (after normalization) into a stable "sha256:<hex>" string. */
export function hashSourceValue(value: string): string {
  const hex = createHash("sha256").update(normalizeForHash(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}

/**
 * Compare a derivative's stored sourceHash against a freshly computed hash of the
 * current source value. A missing stored hash counts as `outdated` (never stamped).
 */
export function derivedState(
  storedHash: string | undefined,
  currentSourceValue: string | undefined,
): { state: DerivedState; currentHash?: string } {
  if (currentSourceValue === undefined) return { state: "source-missing" };
  const currentHash = hashSourceValue(currentSourceValue);
  if (!storedHash || storedHash !== currentHash) return { state: "outdated", currentHash };
  return { state: "current", currentHash };
}
