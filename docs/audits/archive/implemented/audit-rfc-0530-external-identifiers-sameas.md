---
rfcId: RFC-0530
auditId: AUDIT-RFC-0530-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0530

## Verdict: Needs revision

The RFC is structurally sound and the additive-only schema changes are correct. However, two findings block approval: (1) the proposed `Organization` optional properties list is factually incomplete — `buildOrganizationNode` emits `founder`, `member`, `areaServed`, `employee`, `makesOffer`, and `identifier` which are all missing from the `optional` list; (2) the RFC overstates the enforcement power of `surface.contract.validate` — the actual implementation does not validate individual JSON-LD node properties against the declared types, so the claim that "build.check will fail" if Organization properties are not in the optional list is not backed by code.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0530 --json` returns 0 violations.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is present tense. TypeScript contracts are minimal signatures. File system responsibilities table names concrete paths. Failure modes describe behavior. Alternatives section has three real alternatives with rejection reasons. Risks includes agent misinterpretation risk. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-16]` is a real invariant (`docs/architecture-dna.md:67`). The RFC body explains how the projection chain strengthens the semantic layer by deriving `sameAs` from the same PBP entity graph that drives all other semantic outputs — a defensible interpretation of DNA-16's "semantic outputs must be derived from the same page topology and visibility state."

## Axis C — Ecosystem fit

**Finding C-1: `surface.contract.validate` enforcement claim is overstated.** The RFC states (line 227): "If the rendered JSON-LD contains an Organization node with properties not declared in `jsonld-types.yaml`, the C-surface guard fails `build.check`." The actual implementation at `packages/os/site-kernel-handoff/src/surface-contract.ts:100-118` only checks that `jsonldTypes.types` is non-empty — it does NOT scan rendered JSON-LD nodes or validate individual properties against the declared `optional`/`required` lists. The code comment at line 105 says: "This is a lightweight check — full validation would scan all pages." The per-property validation the RFC describes does not exist in the current codebase. The RFC should either acknowledge that the Organization type declaration is declarative-only (contract documentation, not runtime enforcement) or propose enhancing `surface.contract.validate` to actually validate rendered JSON-LD properties.

**Finding C-2: Missing Compass sync identification.** The RFC changes shared package contracts (`@gogol/pbp` schemas, `@gogol/ontology` C-contract) but does not identify which `docs/*.xml` Compass files need synchronization (root AGENTS.md Compass document duties).

**Finding C-3: Missing AGENTS.md update identification.** `packages/pbp/AGENTS.md` lists all PBP entity interface fields. Adding `externalIdentifiers` to `PbpBusiness`, `PbpBrand`, `PbpLegalIdentity` and `sameAs` to `PbpWebPresence` requires updating the entity field listings in that file. The RFC does not mention this.

## Axis D — Forward-only compliance

No issues. All changes are additive optional fields. No compatibility shims, no dual paths, no legacy code maintained behind flags.

## Axis E — Agent-facing policy

No issues. Status gate is correct — implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." References to RFC-0224 and RFC-0334 are present. Anti-fabrication: the RFC correctly distinguishes code changes from manual content authoring.

## Axis F — Pragmatism

**Finding F-1: `externalIdentifiers` on Brand and LegalIdentity has no projection path.** The RFC adds `externalIdentifiers` to `Business`, `Brand`, and `LegalIdentity`, but the projection (`projectToSemanticSiteProfile`) only extracts `externalIdentifiers` from `Business`. Brand and LegalIdentity `externalIdentifiers` are not projected to any JSON-LD output. The RFC does not explain why these fields are needed on Brand and LegalIdentity if they have no projection path. Either justify (e.g., "for future per-entity JSON-LD nodes") or remove from this RFC to avoid speculative schema additions.

## Axis G — Blind spots

**Finding G-1: Proposed `optional` list is factually incomplete.** The RFC proposes `optional: [legalName, description, foundingDate, email, address, sameAs, logo, image, contactPoint]` and states (line 247): "the `optional` list is comprehensive ... and covers all fields `buildOrganizationNode` currently emits." This is factually incorrect. `buildOrganizationNode` (`packages/share/src/semantic/jsonld/organization.ts:17-99`) also emits: `identifier` (line 30, from `registration`), `founder` (line 33), `member` (line 40), `areaServed` (lines 65/67), `employee` (line 72), and `makesOffer` (line 82). These six properties are missing from the proposed `optional` list. Even though `surface.contract.validate` does not currently enforce per-property validation, the declarative contract should be accurate for future enforcement and for documentation correctness.

**Finding G-2: No existing tests for `projectToSemanticSiteProfile`.** The acceptance criteria mention "unit test verifying sameAs projection" but there are no existing test files for `projectToSemanticSiteProfile` in `packages/pbp/`. The RFC should note that a new test file needs to be created (e.g., `packages/pbp/src/__tests__/semantic-profile.test.ts`).

**Finding G-3: Projection uses `Record<string, unknown>` casts.** The projection code in the RFC uses `(business.externalIdentifiers ?? {}) as Record<string, { schemeRef: string; value: string }>` and similar casts for WebPresence. The existing `projectToSemanticSiteProfile` already uses `Record<string, unknown>` casts throughout (lines 57-72), so this is consistent with the existing pattern. However, once the schemas are updated with typed `externalIdentifiers` fields, the projection should ideally use the typed interfaces rather than casts. This is a minor style concern, not a blocker.

## Questions for the author

1. Should the `Organization` `optional` list be expanded to include all properties that `buildOrganizationNode` emits (`identifier`, `founder`, `member`, `areaServed`, `employee`, `makesOffer`), or should the RFC acknowledge that the list is intentionally limited to the properties this RFC adds?
2. Does `surface.contract.validate` actually enforce per-property validation against the declared types, or is the Organization type declaration declarative-only? If the latter, the RFC should correct the enforcement claims in the Rollout and Failure modes sections.
3. Why are `externalIdentifiers` added to `Brand` and `LegalIdentity` if the projection only uses `Business.externalIdentifiers`? What is the intended future projection path for these fields?
4. Which `docs/*.xml` Compass files and `AGENTS.md` files need synchronization after these schema changes?
