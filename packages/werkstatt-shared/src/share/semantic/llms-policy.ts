/*
<MODULE_CONTRACT>
<purpose>RFC-0142: pure resolution of per-page llms inclusion depth. Maps the raw `output.llms` declaration from system.md to an effective SemanticLlmsPolicy, applying a conservative default-by-semanticType map.</purpose>
<non-goals>
  <item>Do not read files or content — pure function only.</item>
  <item>Do not format llms output — that lives in llms.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0142: Initial implementation.</item>
  <item>RFC-0328: Added legal-page default llms depth "exclude".</item>
</CHANGE_SUMMARY>
*/

import type { SemanticLlmsDepth, SemanticLlmsPolicy } from "./models.ts";

/** Raw per-page llms declaration as authored in system.md (`output.llms`). */
export type RawLlmsPolicy =
  SemanticLlmsDepth | { depth?: SemanticLlmsDepth; sections?: { exclude?: string[] } };

const VALID_DEPTHS: ReadonlySet<string> = new Set<SemanticLlmsDepth>([
  "full",
  "summary",
  "index-only",
  "exclude",
]);

/**
 * RFC-0142 / RFC-0328: conservative default depth by semanticType. `openSource`
 * is unambiguously low-signal across all apps and is demoted by default. Legal
 * pages are first-class statutory pages and are excluded from the public AI
 * feed by default.
 */
export const LLMS_DEPTH_BY_SEMANTIC_TYPE: Readonly<Record<string, SemanticLlmsDepth>> = {
  openSource: "index-only",
  legal: "exclude",
};

const DEFAULT_DEPTH: SemanticLlmsDepth = "full";

function isValidDepth(value: unknown): value is SemanticLlmsDepth {
  return typeof value === "string" && VALID_DEPTHS.has(value);
}

/**
 * Resolve the effective llms policy for a page.
 *
 * Precedence: explicit `output.llms` (string or object) > default-by-type > `full`.
 * An unrecognized explicit depth falls back to the type default (callers may warn).
 */
export function resolveLlmsPolicy(
  raw: RawLlmsPolicy | undefined,
  semanticType: string,
): SemanticLlmsPolicy {
  const typeDefault = LLMS_DEPTH_BY_SEMANTIC_TYPE[semanticType] ?? DEFAULT_DEPTH;

  if (raw === undefined || raw === null) {
    return { depth: typeDefault };
  }

  // String shorthand: `output.llms: index-only`
  if (typeof raw === "string") {
    return { depth: isValidDepth(raw) ? raw : typeDefault };
  }

  // Object form: `output.llms: { depth, sections }`
  const depth = isValidDepth(raw.depth) ? raw.depth : typeDefault;
  const excludeIds = raw.sections?.exclude?.filter((id) => typeof id === "string" && id.length > 0);

  return {
    depth,
    ...(excludeIds && excludeIds.length > 0 ? { sections: { exclude: excludeIds } } : {}),
  };
}
