---
rfcId: RFC-0488
auditId: AUDIT-RFC-0488-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0488

## Verdict: Needs revision

The RFC is architecturally sound and well-scoped, but has a blocking mechanical error (V-24: empty `satisfies[]`), a missing `## Problem` section, and several findings around label schema strictness, `packagesImpacted` completeness, and the `organization-as-author` rule scope that need resolution before implementation.

## Mechanical validation (rfc.validate)

**Fail** — 1 error, 3 warnings:

- **V-24 (error)**: architecture RFC created 2026-07-22 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). `satisfies: []` is empty.
- **V-13 (warning)**: Missing required section `## Problem`. The RFC uses `## Context` and `## Current problems` but the validator expects a `## Problem` section.
- **V-19 (warning)**: `RFC-0220.amendedBy` does not include RFC-0488; `RFC-0232.amendedBy` does not include RFC-0488. (Acceptance criteria item 17 covers this, but it should be done at enhance time, not deferred to implementation.)

## Axis A — Structural completeness

- **Missing `## Problem` section** (V-13). The `## Context` → `## Current problems` structure is semantically equivalent but does not satisfy the validator. Rename `## Current problems` to `## Problem` or add a `## Problem` section.
- **CLI surface** is thin. The RFC lists `material.credits.validate`, `material.credits.generate`, `material.credits.report` as changed commands but does not show exact command invocations with flags and scope. Only `material.credits.validate --site webgogol-com` appears in acceptance criteria. The `--json` output shape is not documented for any command.
- **Failure modes** does not specify exit codes. It uses "fail" and "warn" but does not map to exit codes (0 vs 1). The existing validator uses `resultFromViolations` (exit 1 on violations) and `diagnosticsResult` (exit 0 with warnings) — the RFC should state which new rules are fail (exit 1) vs warn (exit 0).
- **Rollout** describes the adoption path but does not specify default behavior for new apps: do new apps get the new validation rules (`missing-usage-basis`, `organization-as-author`, etc.) by default, or only `webgogol-com`?

## Axis B — DNA alignment

- **FAIL — empty `satisfies[]`** (V-24 error). The RFC must declare at least one DNA invariant. Candidates from `docs/architecture-dna.md`:
  - **DNA-4** (canonical content in `src/content/`): the schema extension keeps provenance data in content sidecars, not in code.
  - **DNA-5** (component ↔ content ↔ schema mirror): the schema extension in `@gogol/share` maintains the mirror — the `.astro` section, content `.md` labels, and `.ts` schema are updated together.
  - **DNA-17** (Uni manifest contract): the `credits-gallery` section already has a manifest; the RFC extends its rendering without breaking the quintet.

  The RFC body explains how it fits these invariants but does not declare them in `satisfies[]`. Add at least DNA-4 and DNA-5.

- The `related[]` list references RFC-0480 (Layer C protection) but no DNA invariants. The RFC body says "breaksC: false" and "the credits page URL (`/bildnachweise/`) is preserved" — this is correct but should be tied to a DNA reference if Layer C protection becomes a DNA invariant.

## Axis C — Ecosystem fit

- **Package boundaries** are correct: schema in `@gogol/share`, section in `@gogol/ui`, validator in `@gogol/site-kernel-checks`, generator in `@gogol/site-kernel-codegen`. No cross-app imports. Good.
- **Pipeline placement** is partially specified. Rollout step 9 says "enable new validation rules in `APPS_CHECK_AUTHOR_PIPELINE`" but does not name the specific pipeline for the new rules. The existing `material.credits.validate` runs in a known pipeline; the RFC should state which pipeline the new rules join and whether they are blocking (`build.check`) or advisory.
- **Compass sync**: the RFC changes shared package contracts (`@gogol/share` schema) but does not identify which `docs/*.xml` files need synchronization. Since `docs/technology.xml` tracks shared package schemas, it may need an update.
- **AGENTS.md updates**: the RFC does not identify which `AGENTS.md` files need rule updates. `packages/share/AGENTS.md` documents the material-credit schema exports and should be updated if the public API changes (new label mapping helpers).
- **Command lifecycle** is internally consistent: `commands.proposed` and `commands.changed` both list the three existing commands. Good.

## Axis D — Forward-only compliance

- **No issues.** The RFC is forward-only: new schema fields are additive, the migrator transforms existing sidecars in-place, no compatibility shim or dual-path. Old `sourceType` values remain valid (enum is extended, not replaced). The behavior change (no auto-copyright for AI-generated) is a direct change, not a flag-gated legacy path.

## Axis E — Agent-facing policy

- **Status gate** is correct: "Agents MAY implement code changes only when this RFC has status `accepted`." No self-authorizing language. Good.
- **Anti-fabrication**: acceptance criteria correctly distinguish between code changes (agent) and legal review (operator). The Stuttgart Marathon / Komoot screenshot review is explicitly an operator decision. Good.
- **Implementation notes** reference RFC-0479 (migrator) but do not reference RFC-0224 (accepted→implemented transition) or RFC-0334 (supersede escalation). Minor — not all references are required, but RFC-0224 is the standard transition gate.
- **Storage policy**: no cookies, no `document.cookie`, no persistence changes. Good.

## Axis F — Pragmatism

- **`packagesImpacted` is incomplete.** The RFC registers a migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` (confirmed in the file system responsibilities table, line 369), but `@gogol/site-kernel-handoff` is not listed in `packagesImpacted`. Add it.
- **Label schema strictness contradiction.** The RFC says "Missing labels fall back to the raw enum value, which is a visible regression" (Risks section) but also "The label schema is `.strict()`, so missing keys are caught at parse time." These are contradictory: if `sourceTypeLabels`, `statusLabels`, etc. are required fields in a `.strict()` schema, missing keys cause a **parse error** (build crash), not a fallback. The RFC must decide:
  - **Option A**: make new label fields required → labels files must be updated in the same mission or the build crashes. State this explicitly.
  - **Option B**: make new label fields optional with fallback → the `labelForSourceType` helper already falls back to the raw enum value. But then `.strict()` doesn't catch missing keys (optional keys are not "missing", they are "absent").

  The current `materialCreditLabelsSchema` is `.strict()` with all fields required. Adding new required fields means existing labels files will fail `materialCreditLabelsSchema.parse()` until updated. The RFC should clarify the ordering: labels update (rollout step 6) must happen before or in the same mission as the schema change (rollout step 1).

- **`contentHash` field** is introduced but not used by any validation rule or rendering. It is described as "Content hash of the asset file for integrity verification" but no validator checks it and no generator computes it. This is speculative generality — either add a validation rule that uses it or defer it to a future RFC.
- **`verifiedAt` / `verifiedBy`** fields are introduced but not used by any validation rule. The RFC mentions `verifiedAt` in the label schema but no acceptance criterion checks it. Either add a rule or defer.

## Axis G — Blind spots

- **Usage location discovery performance.** The generator scans all page blocks for references to each credit's `target.id`. For a site with N pages and M credits, this is O(N×M) lookups. The RFC does not estimate the cost or describe the I/O pattern. For `webgogol-com` (small site) this is fine, but the RFC should state the expected scale and whether the scan is incremental or full-rebuild.
- **`organization-as-author` rule scope.** The rule fails when `sourceType: "human-made"` has a `creator` party with `kind: "Organization"`. But the RFC's migrator step 5 says "rename the party role to `commissionedBy`" — this implies the Organization might be a `commissionedBy` party, not the `creator`. The validator rule should check only parties with role `creator` or `coCreator`, not any party with `kind: "Organization"`. A human-made work can have an Organization as `commissionedBy` or `rightsHolder` without violating § 7 UrhG.
- **Label completeness for new `sourceType` values.** The RFC adds 5 new `sourceType` values (`commissioned`, `licensed-third-party`, `customer-supplied`, `public-domain`, `screenshot`). `sourceTypeLabels` is a `Record<MaterialSourceType, string>` — every value in the enum must have a label. The RFC should state that the labels file must include all 10 `sourceType` values (5 existing + 5 new) or the `Record` type is incomplete.
- **Concurrent migration** is not addressed. If two missions run simultaneously on the same Sternsystem (which DNA-46 forbids — only one open mission per system), the migrator could conflict. This is covered by DNA-46 but the RFC doesn't reference it.
- **`evidenceRef` and `generationRecordRef`** are internal references that are never shown to visitors. But the RFC doesn't specify what format they take (file path? URL? internal id?). The validator doesn't check their existence. If they are opaque strings, state that. If they should point to real files, add a validation rule.

## Questions for the author

1. Which DNA invariants does this RFC satisfy? Add at least one to `satisfies[]` to resolve V-24. DNA-4 and DNA-5 are strong candidates.
2. Are the new `materialCreditLabelsSchema` fields (`sourceTypeLabels`, `statusLabels`, `usageBasisLabels`, `aiUsageLabels`, etc.) required or optional? If required, the labels update must happen in the same mission as the schema change — state this explicitly. If optional, remove the `.strict()` claim from the Risks section.
3. Should `@gogol/site-kernel-handoff` be in `packagesImpacted`? The RFC registers a migrator there but doesn't list it.
4. Does the `organization-as-author` rule check only `creator`/`coCreator` parties, or any party with `kind: "Organization"`? A human-made work can have an Organization as `commissionedBy` without violating § 7 UrhG.
5. Are `contentHash`, `verifiedAt`, `verifiedBy` used by any validation rule or rendering? If not, should they be deferred to a future RFC to avoid speculative generality?
