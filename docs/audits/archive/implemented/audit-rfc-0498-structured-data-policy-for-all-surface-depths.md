---
rfcId: RFC-0498
auditId: AUDIT-RFC-0498-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0498

## Verdict: Needs revision

The RFC has a clear and well-motivated decision (per-depth JSON-LD type policy for surface pages), but six required sections are missing (V-13), the `amends` target is questionable, the depth-1.5 label conflicts with RFC-0496's separate-surface model, no migrator is mentioned despite `versionBump: minor`, and the DNA satisfaction claims are not grounded in the RFC body.

## Mechanical validation (rfc.validate)

Pass with 7 warnings:

- **V-13**: Missing required sections: "## Architectural fit", "## Design", "## Rollout", "## Alternatives considered", "## Risks", "## Implementation notes for agents"
- **V-19**: `amends` includes RFC-0432, but RFC-0432.amendedBy does not include RFC-0498

## Axis A — Structural completeness

**Fail** — 6 of 11 required sections are missing:

1. **Architectural fit** — missing. The RFC must explain how it fits DNA-24, DNA-53, RFC-0432, RFC-0492, RFC-0495, RFC-0496, RFC-0497, RFC-0480, and RFC-0478.
2. **Design** — missing. No CLI surface (exact command invocations with flags), no TypeScript contracts, no file system responsibilities table, no output format, no failure modes.
3. **Rollout** — missing. No default behavior, no adoption path for existing sites, no new-site compliance description.
4. **Alternatives considered** — missing. No real alternative with rejection reason.
5. **Risks** — missing. No agent misinterpretation risk, no false-positive rate for validators.
6. **Implementation notes for agents** — missing. No explicit behavioral rules.

The **Decision** section is present-tense and clear. The **Implementation plan** is a 6-step list but lacks detail — no file paths, no command registrations, no pipeline integration. The **Acceptance criteria** are checkable but some are vague ("enforces the per-depth type policy" — what constitutes enforcement?).

## Axis B — DNA alignment

**Fail** — two issues:

1. **DNA-24 satisfaction is not grounded.** The RFC lists `DNA-24` in `satisfies[]` but the RFC body never explains how the JSON-LD type policy enforces, protects, or extends block-declarative pages. DNA-24 is about frontmatter-only page documents with `blocks[]` — JSON-LD type policy is orthogonal. The RFC should either remove DNA-24 from `satisfies[]` or explain the connection (e.g., "the baker emits JSON-LD based on the block-declarative page's depth and surface identity, extending DNA-24's block model to the semantic output layer").

2. **DNA-53 satisfaction is not grounded.** The RFC lists `DNA-53` in `satisfies[]` but never mentions `@gogol/fingerprint` or semantic fingerprints. DNA-53 governs project hashes — the RFC doesn't introduce or use any hashing. If the connection is "no new ad hoc hashing helpers are introduced" (as RFC-0492 argued), the RFC must say so explicitly.

3. **Missing DNA-16.** The RFC governs JSON-LD emission (a semantic output) but does not list `DNA-16` (Semantic layer shares topology with navigation) in `satisfies[]`. DNA-16 is directly relevant — the per-depth type policy is derived from the same page topology used for navigation rendering.

## Axis C — Ecosystem fit

**Fail** — three issues:

1. **Depth-1.5 label conflicts with RFC-0496.** The per-depth type policy table uses "depth-1.5 | website-service" but RFC-0496 explicitly states that service pages are **depth-1 in the separate `website-service` blueprint**, not depth-1.5 in `website-local`. RFC-0496 §Decision: "The service dossier is a separate surface (`website-service`), not a new depth level in `website-local`." The "depth-1.5" label is informal and doesn't exist in any blueprint. The table should either use `website-service` depth-1 or clarify that "depth-1.5" is a logical label, not a blueprint depth. This could confuse agents implementing the policy.

2. **`amends: [RFC-0432]` is questionable.** RFC-0432 defines PBP Schema.org mapping types (`PbpSchemaOrgMapping`, `PbpSchemaOrgLossReport`) in `@gogol/pbp`. RFC-0498 governs surface page JSON-LD type policy — a different concern. RFC-0498 doesn't change any type defined in RFC-0432. The correct amend target is likely RFC-0238 (website-local surface, which RFC-0495 and RFC-0497 already amend) or RFC-0492 (which established the depth-1 JSON-LD correction that RFC-0498 extends to all depths).

3. **Pipeline placement not specified.** The RFC proposes `surface.structured-data.validate` but doesn't name which pipeline it runs in (`build.check`? `sites-check`? `sites-check-postbuild`?) or whether it's blocking or advisory. RFC-0492 and RFC-0497 both specify pipeline integration explicitly.

4. **Compass sync not identified.** The RFC changes the C-contract (`jsonld-types.yaml`) and adds a validation command but doesn't identify which `docs/*.xml` files need synchronization (root AGENTS.md Compass document duties).

5. **AGENTS.md updates not identified.** The RFC doesn't identify which `AGENTS.md` files need rule updates (e.g., `packages/ontology/AGENTS.md` for the C-contract, `packages/os/site-kernel-checks/AGENTS.md` for the new validator).

## Axis D — Forward-only compliance

**Fail** — one issue:

1. **No migrator mentioned.** `versionBump: minor` implies Breaks-B (RFC-0478), which requires a migrator in the registry (RFC-0479). RFC-0492, RFC-0495, RFC-0496, and RFC-0497 all register migrators. RFC-0498 doesn't mention a migrator at all — not even a no-op migrator. The `jsonld-types.yaml` C-contract change is a data contract change in `packages/`, which changes the platform semantic hash. A migrator is required.

No backward compatibility shims or dual-paths are proposed — good. Legacy JSON-LD types (`LocalBusiness`, `Electrician`, `HairSalon`) are to be removed, not maintained behind a flag — good.

## Axis E — Agent-facing policy

**Fail** — two issues:

1. **No implementation notes for agents.** The RFC is missing the required "## Implementation notes for agents" section (V-13). Agents need explicit behavioral rules: when they may implement, what they must not do (e.g., fabricate JSON-LD), what commands they must run after implementation, and what AGENTS.md files to update.

2. **No governance references.** The RFC doesn't reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation on invariant conflict), or RFC-0330 (verification evidence). All comparable recent RFCs (0492, 0495, 0496, 0497) include these references.

No self-authorizing language is present — good. No storage policy concerns — N/A.

## Axis F — Pragmatism

**Fail** — two issues:

1. **New command justification missing.** `surface.structured-data.validate` is proposed as a new command, but the RFC doesn't explain why the existing `seo.structured.data.validate` (RFC-0074) cannot be extended with prohibited-type checking. The existing validator already scans rendered HTML for JSON-LD types — adding a prohibited-types check is a natural extension. The RFC says `seo.structured.data.validate` is "updated to delegate surface page type checking to `surface.structured-data.validate`" but doesn't explain why delegation is better than inline extension. RFC-0492's `surface.industry.validate` earned its existence because it checks publication gates, claim restrictions, and duplicate content — much more than type checking. RFC-0498's `surface.structured-data.validate` only checks types and breadcrumb URLs.

2. **`@gogol/share` in `packagesImpacted` is unexplained.** RFC-0492 already extended `SemanticModelOptions` with `surfaceId` and `depth`, and `buildServiceNodes` already suppresses org-level Service nodes for depth-1. RFC-0498 doesn't explain what additional changes are needed in `@gogol/share`. If the baker already emits the correct JSON-LD for depth-1 (per RFC-0492), the changes for other depths may be in the baker (`@gogol/site-kernel-checks`) and the C-contract (`@gogol/ontology`) only.

## Axis G — Blind spots

**Fail** — four issues:

1. **Performance cost not specified.** `surface.structured-data.validate` scans all surface pages' rendered HTML. The RFC doesn't estimate the scan count or I/O patterns. With 2 industries × 6 cities × ~4 services = ~48 potential pages, the cost is low, but the RFC should state this.

2. **False-positive suppression not described.** The validator enforces prohibited types. What if a page legitimately needs a type on the prohibited list (e.g., a future depth that requires `Service` on a depth-4 city page for a specific reason)? No suppression mechanism or exception process is described.

3. **Edge cases not considered.** Empty surface (new site with no generated pages), surface with only depth-0 pillar, concurrent execution (two builds), interrupted operations — none are addressed.

4. **Migration path for existing dist artifacts.** The RFC says the baker is updated, but existing built `dist/` artifacts may still contain `LocalBusiness` or `Electrician` JSON-LD. The RFC doesn't describe whether `surface.structured-data.validate` runs against `dist/` (post-build) or against generated page definitions (pre-build). If post-build, existing dist artifacts will fail until rebuilt.

## Questions for the author

1. Why does this RFC amend RFC-0432 (PBP Schema.org mapping types) instead of RFC-0238 (website-local surface) or RFC-0492 (which established the depth-1 JSON-LD correction that this RFC extends to all depths)?

2. The per-depth type policy table uses "depth-1.5" but RFC-0496 explicitly states that service pages are depth-1 in the separate `website-service` blueprint, not depth-1.5 in `website-local`. Should the table use `website-service` depth-1 instead, or is "depth-1.5" an intentional logical label that needs to be defined?

3. `versionBump: minor` requires a migrator (RFC-0479). What migrator is registered for this RFC — is it a no-op migrator (like RFC-0495/0497) or does it transform data?

4. Why is a new `surface.structured-data.validate` command needed instead of extending the existing `seo.structured.data.validate` (RFC-0074) with prohibited-type checking? The existing validator already scans rendered HTML for JSON-LD types.

5. What changes are needed in `@gogol/share`? RFC-0492 already extended `SemanticModelOptions` with `surfaceId` and `depth` — what additional `@gogol/share` changes does this RFC require?
