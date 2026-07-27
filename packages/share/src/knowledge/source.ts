/*
<MODULE_CONTRACT>
<purpose>
RFC-0214: external source binding. A source descriptor names an external authority
and how to obtain a value (kind, endpoint, extraction, expected type, check cadence,
tolerance). A claim's sourceRef resolves to a descriptor; the shared Truth Monitor
fetches it on a cadence and compares the observed value to the asserted one. This
module is the framework-free contract: the zod descriptor schema, value extraction,
and tolerance comparison — reused by source.binding.validate and source.monitor.run.
</purpose>
<non-goals>
  <item>Do not perform network I/O — the monitor command/worker fetches; this module only shapes + compares.</item>
  <item>Do not parse HTML selectors here — that lives in the worker runtime (browser/DOM); the shared lib handles JSON.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0214: initial source descriptor schema, JSON extraction, tolerance compare.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const SOURCE_KINDS = ["http-json", "http-html-selector", "rest-api", "manual"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

const ISO8601_DURATION = /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

export const sourceToleranceSchema = z.object({
  kind: z.enum(["exact", "relative", "absolute"]),
  value: z.number().nonnegative(),
});
export type SourceTolerance = z.infer<typeof sourceToleranceSchema>;

export const sourceDescriptorSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    kind: z.enum(SOURCE_KINDS),
    endpoint: z.string().url().optional(),
    /** JSONPath-lite (`$.a.b[0].c`) or CSS selector (http-html-selector). */
    extract: z.string().min(1).optional(),
    expectedType: z.enum(["string", "integer", "number", "money", "date", "enum"]),
    checkEvery: z
      .string()
      .regex(ISO8601_DURATION, "must be an ISO 8601 duration (e.g. P3M)")
      .refine((v) => v !== "P" && v !== "PT", "duration must have at least one component"),
    tolerance: sourceToleranceSchema.optional(),
    residency: z.enum(["eu", "any"]).optional().default("eu"),
    /** RFC-0241: the source's license (e.g. "CC-BY-4.0"), for third-party cited datasets. */
    license: z.string().min(1).optional(),
    /**
     * RFC-0241: identity-firewall marker for external public-good sources that must be cited, never
     * branded as a studio project. "ownership-forbidden" is enforced by a dedicated firewall check
     * (e.g. `hdri.firewall.validate`), not by this schema.
     */
    firewall: z.enum(["ownership-forbidden"]).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.kind !== "manual" && !d.endpoint) {
      ctx.addIssue({
        code: "custom",
        message: `kind "${d.kind}" requires an endpoint`,
        path: ["endpoint"],
      });
    }
    if ((d.kind === "http-json" || d.kind === "http-html-selector") && !d.extract) {
      ctx.addIssue({
        code: "custom",
        message: `kind "${d.kind}" requires an extract path`,
        path: ["extract"],
      });
    }
  });

export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;

/**
 * Read a JSONPath-lite expression `$.a.b[0].c` from a parsed JSON value.
 * Supports dotted keys and `[index]` array access. Returns undefined on any miss.
 */
export function extractJsonPath(payload: unknown, path: string): unknown {
  const trimmed = path.startsWith("$.")
    ? path.slice(2)
    : path.startsWith("$")
      ? path.slice(1)
      : path;
  const tokens: string[] = [];
  for (const seg of trimmed.split(".")) {
    if (seg === "") continue;
    const m = seg.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    if (m[1]) tokens.push(m[1]);
    for (const idx of m[2]!.matchAll(/\[(\d+)\]/g)) tokens.push(idx[1]!);
  }
  let cur: unknown = payload;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(tok);
      if (!Number.isInteger(i)) return undefined;
      cur = cur[i];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[tok];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Pull the first number out of a string/number (handles "70 € / Monat", "39,120"). */
export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\s/g, "")
    .replace(/[.,](?=\d{3}(?:\D|$))/g, "") // drop thousands separators
    .replace(",", "."); // remaining comma = decimal point
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Compare an observed value against the asserted one under a descriptor's tolerance.
 * Numeric types compare numerically (with relative/absolute bands); others compare as
 * normalized strings (exact). Returns whether the observed value is within tolerance.
 */
export function compareValues(
  asserted: unknown,
  observed: unknown,
  expectedType: SourceDescriptor["expectedType"],
  tolerance?: SourceTolerance,
): { withinTolerance: boolean; assertedStr: string; observedStr: string } {
  const assertedStr = String(asserted ?? "");
  const observedStr = String(observed ?? "");
  const numeric =
    expectedType === "integer" || expectedType === "number" || expectedType === "money";

  if (numeric) {
    const a = coerceNumber(asserted);
    const o = coerceNumber(observed);
    if (a === null || o === null) {
      return { withinTolerance: assertedStr === observedStr, assertedStr, observedStr };
    }
    const t = tolerance ?? { kind: "exact" as const, value: 0 };
    let within: boolean;
    if (t.kind === "exact") within = a === o;
    else if (t.kind === "absolute") within = Math.abs(a - o) <= t.value;
    else within = a === 0 ? o === 0 : Math.abs(a - o) / Math.abs(a) <= t.value; // relative
    return { withinTolerance: within, assertedStr, observedStr };
  }

  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return { withinTolerance: norm(assertedStr) === norm(observedStr), assertedStr, observedStr };
}

/** One Truth Monitor finding, written to the outbox and surfaced by source.binding.validate. */
export interface DivergenceRecord {
  sourceId: string;
  /** Canonical subject string of the bound claim. */
  subject: string;
  app: string;
  assertedValue: string;
  observedValue: string;
  withinTolerance: boolean;
  observedAt: string;
  /** True when the source could not be fetched (CKL-SRC-04, info — not a divergence). */
  unreachable?: boolean;
}
