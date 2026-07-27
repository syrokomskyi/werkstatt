---
rfcId: RFC-0482
auditId: AUDIT-RFC-0482-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0482

## Verdict: Needs revision

The RFC has a mechanical V-24 violation (`satisfies: []` empty on an architecture RFC post-cutoff) and a `versionBump: minor` / "no migrator needed" contradiction that must be resolved before implementation. The locale-overlay blind spot also needs explicit treatment.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-24** (error): architecture RFC created 2026-07-22 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). `satisfies: []` is empty.

## Axis A — Structural completeness

- **RFC-0467 missing from `related[]`**: the body references RFC-0467 on line 79 ("RFC-0467") when discussing migration strictness mode, but `related[]` in the frontmatter lists only DNA-20, RFC-0045, RFC-0398, RFC-0466, RFC-0471, RFC-0481. RFC-0467 should be in `related[]` since the RFC's compiler strictness argument depends on it.
- **Incorrect strictness mode name**: the RFC says "Moving to `strict` mode would reject these fields" (line 95), but the actual `PbpBuildStrictness` type in `@/packages/pbp/src/compiler-pipeline.ts:46` is `"production" | "migration"` — there is no `"strict"` mode. The RFC should say `production` mode.
- **Decision section** is clear and present-tense. **Rollout** describes default behavior and adoption path. **Alternatives** has 4 real alternatives with rejection reasons. **Risks** covers loose typing, locale divergence, and spec conflict. **Acceptance criteria** are checkable and sufficient. **Implementation notes** have explicit behavioral rules. No other structural issues.

## Axis B — DNA alignment

- **`satisfies: []` is empty** — V-24 violation. The RFC extends `@gogol/pbp` schemas (package boundary, DNA-1) and completes the PBP migration (DNA-20 superseded). At minimum, `satisfies: [DNA-1]` is warranted since the RFC extends a shared package within the monorepo boundary. The RFC body's "Architectural fit" section explains the DNA-20 relationship but does not declare any `satisfies` entry.
- **No new DNA invariant established** — the RFC does not claim to establish a new DNA invariant, so no `architecture-dna.md` update is needed.
- **`related[]` DNA references** — DNA-20 is listed and relevant (the RFC extends the replacement layer). No decorative references.

## Axis C — Ecosystem fit

- **Package boundaries**: the RFC correctly scopes changes to `packages/pbp/src/schemas/` — no app-side logic, no cross-package imports. Compliant with DNA-1.
- **Compass sync**: the RFC identifies no `docs/*.xml` files needing synchronization. Since the RFC adds optional fields to existing Zod schemas (not changing repository-wide requirements or app-package relationships), this is acceptable.
- **AGENTS.md updates**: the RFC does not mention updating `packages/pbp/AGENTS.md`. The `presentation` field is a new schema feature that should be documented in the package's AGENTS.md "Runtime layer" or "Downstream RFC rules" section. This is a minor gap.
- **Command lifecycle**: `commands.proposed/added/changed/removed` are all empty — correct, since the RFC adds no new commands.
- **Cosmic naming**: not applicable — the RFC touches Zod schemas, not manifests or component/section/page contracts.

## Axis D — Forward-only compliance

- **No compatibility shim** — the `presentation` field is a new optional field, not a bridge that keeps legacy behavior alive. The legacy `business/` collection deletion is deferred to RFC-0483, not indefinitely. This is acceptable forward-only scoping.
- **No dual-path** — the RFC does not propose maintaining both `presentation` and legacy flat fields. RFC-0483 will migrate content references and delete the legacy collection.
- **No flag-guarded legacy path** — the schema change is unconditional: `presentation` is optional, not behind a feature flag.

## Axis E — Agent-facing policy

- **Status gate**: the RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Correct — no self-authorizing language.
- **Governance references**: the RFC references RFC-0224 for accepted→implemented transition. Correct.
- **Anti-fabrication**: the acceptance criteria are code-side (schema fields, build:check, test). The RFC does not claim content will be auto-generated. The `presentation` data migration is explicitly deferred to RFC-0483's migrator. Good.
- **Storage policy**: not applicable — no persistence changes.

## Axis F — Pragmatism

- **`versionBump: minor` vs. "no migrator needed"**: the RFC declares `versionBump: minor` but the rollout section says "No migrator needed — existing entities without `presentation` validate unchanged." Per RFC-0478 (draft), `minor` = Breaks-B (requires migrator). Adding an optional field to a `.strict()` schema is additive — existing entities validate unchanged. This is either:
  - A `patch` change (safe, no break) — in which case `versionBump` should be `patch`, or
  - A `minor` change that extends the schema surface — in which case the "no migrator needed" claim needs qualification (the schema hash changes, but no data migration is required).

  This contradiction must be resolved before implementation. If RFC-0478 is adopted, `platform.consistency.validate` will flag a hash-changed-but-version-not-bumped mismatch.

- **Lean contracts**: `z.record(z.string(), z.unknown())` is the minimum viable type for a flexible presentation bag. The RFC rejects typed sub-schemas with a clear rationale (site-specific data). Good.
- **Scope discipline**: `appsImpacted` and `packagesImpacted` are correctly scoped. `nonGoals` are explicit and meaningful (5 items). Good.
- **Why only 5 schemas?**: the RFC adds `presentation` to offering, legal-identity, web-presence, public-document, and business. But other entities (product, place, contact-point, brand, catalog, etc.) may also benefit from presentation data in the future. The RFC should clarify whether this is an exhaustive list (requiring a new RFC for other entities) or a precedent that can be extended without a new RFC.

## Axis G — Blind spots

- **Locale overlay interaction**: the RFC says "presentation fields should be authored per-locale, not overlaid" (line 354). But the PBP compiler's locale resolution phase (`resolveLocales` in `src/compiler/locale.ts`) performs deep-merge across locales. If `de/business.md` has a `presentation` block and `uk/business.md` does not, the deep-merge will bring the `de/` presentation into the `uk/` resolved entity — the opposite of "per-locale, not overlaid." The RFC does not explain how to prevent this. This is a real blind spot that could cause German presentation strings to leak into the English locale at build time.

- **Performance**: `z.record(z.string(), z.unknown())` has negligible Zod parse cost. No performance concern.

- **False positives**: the RFC mentions `content.references.validate` as a mitigation for presentation key typos. This is adequate — references to non-existent paths will fail at build time. No false-positive concern.

- **Edge cases**: the RFC does not discuss empty `presentation: {}` records or `null` values. With `z.record(z.string(), z.unknown()).optional()`, an empty record `{}` validates, and `null` is rejected (the field is optional, not nullable). This is correct behavior but should be documented.

## Questions for the author

1. Should `versionBump` be `patch` instead of `minor`? The change is additive-only (optional field on `.strict()` schemas) and no migrator is needed. If `minor` is intentional, explain why the schema surface extension warrants a minor bump despite being non-breaking.

2. How will `presentation` fields be prevented from being deep-merged across locales by the compiler's `resolveLocales` phase? The RFC says "authored per-locale, not overlaid" but the deep-merge mechanism is automatic with no opt-out. Will the locale resolution phase need modification to exclude `presentation` from merging?

3. Should RFC-0467 be added to `related[]`? The RFC's compiler strictness argument (line 79) depends on RFC-0467's migration mode behavior, but it is not listed in the frontmatter.

4. Is the list of 5 schemas (offering, legal-identity, web-presence, public-document, business) exhaustive, or can `presentation` be added to other entity schemas (product, place, etc.) in the future without a new RFC?
