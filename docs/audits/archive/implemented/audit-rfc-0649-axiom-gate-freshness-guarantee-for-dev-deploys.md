---
rfcId: RFC-0649
auditId: AUDIT-RFC-0649-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0649

## Verdict: Needs revision

The RFC addresses a real problem (stale CDN content producing false-positive Axiom results) with a sound core decision, but has three findings that must be resolved before implementation: a null-adapter blind spot that would break non-CDN deployments, an incomplete `packagesImpacted` list, and TypeScript contracts that don't match the actual `PurgeResult` type in the codebase.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19 (warning)**: `RFC-0649.amends` includes `RFC-0628`, but `RFC-0628.amendedBy` does not include `RFC-0649`. RFC-0628 is archived/implemented — the implementation or enhance step must add `RFC-0649` to RFC-0628's `amendedBy` field.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all present and substantive. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-49]` — DNA-49 exists in `docs/architecture-dna.md:211-213`. The RFC body's Architectural fit section explains how it extends DNA-49 by closing the freshness gap for `leitstand.dev-deploy` (propagate and promote already verify build-identity). No new DNA invariant is established. No conflicts with existing invariants.

## Axis C — Ecosystem fit

**Finding C-1: Missing AGENTS.md update callout.** The RFC changes CDN cache purge from non-fatal to fatal in `leitstand.dev-deploy`, but does not mention updating `packages/os/site-kernel-handoff/AGENTS.md`. The current Leitstand section (line 51) states: "Purge failures are non-blocking warnings." This RFC directly contradicts that rule for `leitstand.dev-deploy` — the AGENTS.md update must be called out in the Rollout section.

**Finding C-2: Missing DNA-49 prose update callout.** The RFC extends DNA-49 (freshness guarantee for dev deploys) but does not mention updating DNA-49 prose in `docs/architecture-dna.md` to reflect that `leitstand.dev-deploy` now verifies CDN freshness before running the Axiom gate. The `related` field references DNA-49, but the Rollout section should include a DNA-49 prose update step, mirroring how RFC-0634 and RFC-0628 both called out DNA-49 prose updates.

## Axis D — Forward-only compliance

No issues. No compatibility shim, bridge, or dual-path. The non-fatal purge behavior is replaced, not maintained behind a flag. No deprecation — the RFC amends RFC-0628 behavior directly.

## Axis E — Agent-facing policy

No issues. Status gate is correct — RFC is `draft` and implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. Implementation notes reference RFC-0224 and RFC-0334 correctly. No content authoring in acceptance criteria. No persistence changes.

## Axis F — Pragmatism

**Finding F-1: `packagesImpacted` is incomplete.** The RFC proposes adding a `fatal` field to `PurgeResult` (TypeScript contracts section, line 153-158). `PurgeResult` is defined in `@warpgogol/ontology/operations` (`packages/ontology/src/operations/leitstand.ts:31-34`) as `purgeResultSchema`. Adding `fatal` to this schema impacts `packages/ontology`, but `packagesImpacted` only lists `site-kernel-handoff`. Either `@warpgogol/ontology` must be added to `packagesImpacted`, or the RFC must clarify that `fatal` is a local field in `leitstand-commands.ts` that does not extend the ontology schema.

**Finding F-2: TypeScript contracts don't match actual `PurgeResult` type.** The RFC shows:

```ts
interface PurgeResult {
  purged: boolean;
  error?: string;
  fatal: boolean;
}
```

The actual `PurgeResult` in `@warpgogol/ontology/operations` (`packages/ontology/src/operations/leitstand.ts:31-34`) is:

```ts
export const purgeResultSchema = z.object({
  success: z.boolean(),
  purgedUrls: z.number(),
  error: z.string().optional(),
});
```

The RFC's proposed type has `purged: boolean` (should be `success: boolean`), is missing `purgedUrls: number`, and uses the same type name `PurgeResult` — creating ambiguity about whether this is a new local type or an extension of the ontology schema. The contracts must match the actual codebase types.

## Axis G — Blind spots

**Finding G-1: Null adapter blind spot.** The RFC's Rollout section states: "Apps without CDN configuration (null adapter) are unaffected because purge is only invoked for `cloudflare-workers` adapter." However, the current code in `leitstand-commands.ts:595-601` calls `runPurgeStep` unconditionally for all adapters, including `null`. There is no adapter check before the purge call.

Under the current behavior, null-adapter deployments without `CLOUDFLARE_ZONE_ID` get a warning and skip purge. Under the RFC's proposed behavior, missing `CLOUDFLARE_ZONE_ID` becomes `fatal: true`, which would block all null-adapter dev deploys. The RFC must either:

1. Add an adapter check in `runLeitstandDevDeploy` to skip `runPurgeStep` for `null` adapter (and document this in the Design section), or
2. Clarify that null-adapter deployments are expected to set `CLOUDFLARE_ZONE_ID` (which doesn't make sense for a null adapter).

This is a blocking issue — the RFC's Rollout claim is inconsistent with the current code.

## Questions for the author

1. How should null-adapter deployments behave? The current code calls `runPurgeStep` unconditionally. Making missing `CLOUDFLARE_ZONE_ID` fatal would block null-adapter dev deploys. Should `runPurgeStep` be skipped for `null` adapter, or should the `fatal` flag only apply when the adapter is `cloudflare-workers`?

2. Is the `fatal` field added to the ontology `purgeResultSchema` (impacting `@warpgogol/ontology`) or is it a local field only in `leitstand-commands.ts`? If ontology, `packagesImpacted` must include `@warpgogol/ontology`. If local, the type name should differ from `PurgeResult` to avoid confusion.

3. The V-19 warning (RFC-0628.amendedBy doesn't include RFC-0649) — RFC-0628 is archived/implemented. Should the implementation add RFC-0649 to RFC-0628's `amendedBy` field during the enhance or implement step, or is the V-19 warning accepted as-is?
