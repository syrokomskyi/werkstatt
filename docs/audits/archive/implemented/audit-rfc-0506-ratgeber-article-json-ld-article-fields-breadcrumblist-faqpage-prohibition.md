---
rfcId: RFC-0506
auditId: AUDIT-RFC-0506-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0506

## Verdict: Needs revision

The RFC has a direct contradiction with RFC-0479 (migrator requirement for `versionBump: minor`), four missing required sections (V-13), and two critical data-flow gaps: the `author` structured Person and `dateModified` source both require `SemanticPageModel` changes that the RFC does not describe. The C-contract changes themselves are sound and address a real drift.

## Mechanical validation (rfc.validate)

Pass with 5 warnings:

- **V-13**: Missing required section `## Architectural fit`.
- **V-13**: Missing required section `## Design`.
- **V-13**: Missing required section `## Acceptance criteria`.
- **V-13**: Missing required section `## Implementation notes for agents` (the RFC has `## Implementation notes` — wrong heading name).
- **V-19**: `RFC-0506.amends` includes `RFC-0500`, but `RFC-0500.amendedBy` does not include `RFC-0506`.

## Axis A — Structural completeness

- **Missing `## Architectural fit`** (V-13). The `satisfies` frontmatter lists DNA-16, DNA-24, DNA-53 but the body never explains how the RFC enforces, protects, or extends each invariant. Compare RFC-0498 lines 182–196 for the expected pattern.
- **Missing `## Design`** (V-13). The RFC has `### Renderer changes` and `### Validator changes` subsections but no formal `## Design` section with CLI surface, TypeScript contracts, file system responsibilities table, output format, and failure modes. The field mapping table (lines 111–119) is a partial substitute but does not cover the full design surface.
- **Missing `## Acceptance criteria`** (V-13). The `successSignals` in frontmatter are not checkable acceptance criteria with evidence. No `[x]` or `[ ]` items exist.
- **Missing `## Implementation notes for agents`** (V-13). The RFC has `## Implementation notes` (line 174) — the heading must be `## Implementation notes for agents` to satisfy V-13.
- **Author record data flow gap.** The RFC declares `author` should be `{ @type: Person, name: author.name, url: author.contactUrl }` from the author record (RFC-0502, line 115). But `SemanticPageModel.author` is typed as `string` (`packages/share/src/semantic/models.ts:332`), and `buildArticleNode` uses `page.author` as a plain string (`packages/share/src/semantic/jsonld/article.ts:30`). The RFC does not describe how `contactUrl` from the author record flows into the semantic model — a new `SemanticPageModel` field or a richer `author` type is needed.
- **dateModified source gap.** The RFC declares `dateModified` as "Latest of `reviewedAt` or latest `changelog[].date`" (line 118). But `SemanticPageModel` has no `reviewedAt` or `changelog` field. The current `buildArticleNode` uses `page.dateModified ?? page.datePublished` (article.ts:29). The RFC does not describe how `reviewedAt` and `changelog` data reach the renderer.
- **FAQPage suppression mechanism not described.** The RFC prohibits FAQPage on ratgeber depth-1 (line 123) but does not describe how `buildFaqNodes` (`packages/share/src/semantic/jsonld/faq.ts:42`) is gated. Currently, `buildFaqNodes` is called unconditionally in `buildJsonLd` (`packages/share/src/semantic/jsonld.ts:64`). The RFC must specify: does `buildFaqNodes` check `surfaceId === "ratgeber" && depth === 1` and return `[]`, or does `buildJsonLd` skip the call?
- **`mainEntityOfPage` form mismatch.** The RFC says "this RFC uses the URL string form for simplicity" (line 177). But `buildArticleNode` already emits `mainEntityOfPage: { "@id": webpageId }` (article.ts:32) — an object reference, not a URL string. The RFC must explicitly state this is a change from `@id` object to URL string, or justify keeping the object form.
- **`publisher` already emitted.** The RFC marks `publisher` as "Yes (expert requirement)" (line 116) but `buildArticleNode` already emits `publisher: { "@id": ids.organization }` (article.ts:31). The RFC should acknowledge this is already implemented and clarify whether the change is from `@id` reference to inline object.
- **`description` already emitted.** `buildArticleNode` already emits `description: page.description` (article.ts:27). The C-contract `jsonld-types.yaml` Article type does not list `description` in optional fields (line 19). The RFC fixes this drift but should acknowledge it exists.
- **Risks section lacks structured table.** The `## Risks` section (lines 168–172) uses prose, not the standard risk table with Likelihood/Mitigation columns (cf. RFC-0498 lines 304–312).

## Axis B — DNA alignment

- **DNA-16 (Semantic layer shares topology with navigation):** Listed in `satisfies` but not explained in the body. The RFC should state that the Article JSON-LD fields are derived from the same `SemanticPageModel` that feeds navigation — no parallel page-structure model is introduced.
- **DNA-24 (Block-declarative pages):** Listed in `satisfies` but not explained. The RFC should state that JSON-LD emission is a renderer concern (`@gogol/share`), not a baker or route concern — consistent with DNA-24's block-declarative contract.
- **DNA-53 (Semantic fingerprint governance):** Listed in `satisfies` but not explained. The RFC should state that no new ad hoc hashing helpers are introduced — the C-contract change affects the platform semantic hash, which is governed by `versionBump: minor`.
- **Migrator contradiction (RFC-0479).** `versionBump: minor` (line 35) means Breaks-B, which requires a migrator per RFC-0479. The RFC explicitly says "No migrator required" (line 149). RFC-0498 — same `versionBump: minor`, same C-contract-only change — registered a no-op migrator to advance `migratorCursor`. RFC-0506 must do the same. This is a **failure** — the RFC contradicts a binding platform governance rule.

## Axis C — Ecosystem fit

- **Missing `@gogol/site-kernel-handoff` in `packagesImpacted`.** The RFC lists `surface.contract.validate` in `commands.changed` (line 41). That command lives in `packages/os/site-kernel-handoff/src/surface-contract.ts`. But `packagesImpacted` (lines 45–48) lists only `@gogol/ontology`, `@gogol/share`, `@gogol/site-kernel-checks` — `@gogol/site-kernel-handoff` is missing.
- **No Compass sync mentioned.** The RFC changes `packages/ontology/src/external-surfaces/jsonld-types.yaml` (a C-contract file) but does not identify which `docs/*.xml` Compass files need synchronization. Root AGENTS.md Compass document duties require this.
- **No AGENTS.md updates identified.** The RFC does not mention which `AGENTS.md` files need rule updates. `packages/share/AGENTS.md` (documents `buildArticleNode` behavior) and `packages/ontology/AGENTS.md` (documents `jsonld-types.yaml`) would likely need updates.
- **Package boundaries correct.** Imports flow `packages/* → packages/*` only. No `apps/*` imports proposed. The renderer change is in `@gogol/share`, the C-contract in `@gogol/ontology`, validators in `@gogol/site-kernel-checks` — all correct.
- **Command lifecycle consistent.** `commands.changed` lists `seo.structured.data.validate` and `surface.contract.validate` — both are existing registered commands being extended, not new commands. This is consistent.

## Axis D — Forward-only compliance

- **No backward compatibility shim proposed.** The RFC directly changes the C-contract and renderer — no dual-path, no feature flag. This is forward-only compliant.
- **FAQPage prohibition is immediate removal.** No grace period for existing FAQPage emission on ratgeber depth-1. This is forward-only compliant.
- **Migrator contradiction is also a forward-only issue.** Without a migrator, `migratorCursor` cannot advance for `versionBump: minor`, which means `mission.migrate` will not run the RFC-0506 step. This breaks the forward-only migration flow (RFC-0479).

## Axis E — Agent-facing policy

- **No self-authorizing language.** The RFC does not contain "may proceed while draft" or similar. Status is `draft` — correct.
- **No implementation notes for agents section.** The `## Implementation notes` section (line 174) has general notes but not the agent-facing behavioral rules required by V-13 (e.g., "Agents MUST register a no-op migrator", "Agents MUST update `amendedBy` on RFC-0500", "Agents MUST NOT emit FAQPage JSON-LD on ratgeber depth-1").
- **Anti-fabrication not applicable.** The RFC does not involve content authoring — it is a renderer/validator/C-contract change. No content auto-generation claims.

## Axis F — Pragmatism

- **Scope discipline mostly correct.** `appsImpacted` lists only `warpgogol-com` — correct, ratgeber is warpgogol-com only. `nonGoals` are explicit and meaningful (lines 60–65).
- **Missing package in `packagesImpacted`.** `@gogol/site-kernel-handoff` is missing (see Axis C). This is a scope accuracy issue.
- **No new commands proposed.** The RFC extends existing commands — pragmatic. No command duplication.
- **C-contract change is minimal.** Two optional fields added to Article type, one prohibited type added to ratgeber depth-1 surface policy. This is the minimum needed — no speculative generality.

## Axis G — Blind spots

- **Author record data flow not addressed.** The RFC does not explain how `authorId` → author record → `SemanticPageModel` → `buildArticleNode` data flow works. The `SemanticPageModel` needs a new field or richer `author` type. This is a design blind spot.
- **dateModified source not addressed.** `reviewedAt` and `changelog` are not on `SemanticPageModel`. The RFC does not explain how they reach the renderer. This is a design blind spot.
- **FAQPage suppression edge case.** What happens if a non-ratgeber surface page has FAQ entries? The RFC only prohibits FAQPage on ratgeber depth-1 — other surfaces are unaffected. But the suppression mechanism must be surface-gated, not global. The RFC should clarify this.
- **Performance not addressed.** The validator scans rendered HTML for JSON-LD types. The RFC adds SD-RAT-01..04 rules but does not estimate the scan cost. RFC-0498 estimated ~48 pages — RFC-0506 should reference this or provide its own estimate.
- **False-positive analysis for SD-RAT-02.** The `author` structured Person check (SD-RAT-02) could false-positive if the renderer emits `author` as a string during a partial migration. The RFC should describe the migration window.

## Questions for the author

1. **Migrator:** `versionBump: minor` requires a migrator (RFC-0479). RFC-0498 registered a no-op migrator for the same situation. Will you register a no-op migrator `rfc-0506` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`, or change `versionBump` to `patch`?
2. **Author data flow:** `SemanticPageModel.author` is `string`. How does `contactUrl` from the author record (RFC-0502) reach `buildArticleNode`? Will you add `authorUrl?: string` or `authorRecord?: { name: string; contactUrl?: string }` to `SemanticPageModel`, and who populates it?
3. **dateModified source:** `SemanticPageModel` has no `reviewedAt` or `changelog` field. How do these values reach the renderer? Will you add them to `SemanticPageModel`, or compute `dateModified` upstream and set `page.dateModified`?
4. **FAQPage suppression:** Will `buildFaqNodes` check `surfaceId === "ratgeber" && depth === 1` and return `[]`, or will `buildJsonLd` skip the call? What is the exact gating mechanism?
5. **`mainEntityOfPage` form:** The current renderer emits `{ "@id": webpageId }` (object). The RFC says "URL string form for simplicity." Is this a deliberate change from object to string, or should the object form be kept?
6. **`amendedBy` backreference:** Will you add `RFC-0506` to `RFC-0500.amendedBy` in the same change?
