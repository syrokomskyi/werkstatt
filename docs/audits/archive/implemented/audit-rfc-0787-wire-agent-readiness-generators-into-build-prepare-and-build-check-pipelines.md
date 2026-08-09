---
rfcId: RFC-0787
auditId: AUDIT-RFC-0787-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0787

## Verdict: Needs revision

The RFC describes a pipeline wiring that already exists in the codebase — but with a different ordering, different dev pipeline inclusion, and different validator placement than what the RFC proposes. This creates a fundamental ambiguity: is the RFC proposing to change the existing wiring, or is it unaware that the wiring already exists? Multiple factual errors about the codebase (non-existent file, misclassified artifact paths, reclassified DNA) must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Design section code snippets are inaccurate.** Lines 111–125 show proposed pipeline ordering with generators placed *after* `agent.surface.sign`. The actual codebase (`build-prepare.ts:72–84`) places all agent generators *before* `agent.surface.sign`: `agent.manifest.generate` → `agent.dns-aid.generate` → `agent.openapi.generate` → `agent.api-catalog.generate` → `agent.mcp-card.generate` → `agent.routes.generate` → `agent.surface.sign`. The RFC's comment "After agent.surface.sign (line ~77 in build-prepare.ts)" references a line number that doesn't match (actual: line 84).

- **File system responsibilities table is factually wrong.** Line 151 says "No changes to build-prepare-dev.ts — it imports from build-prepare.ts." There is no `build-prepare-dev.ts` file. The dev pipeline (`SITES_BUILD_PREPARE_DEV_PIPELINE`) is defined as a separate export in `build-prepare.ts` (line 172). The RFC should list `build-prepare.ts` as the single file containing both pipelines.

- **Validators placement is inaccurate.** Lines 130–137 propose adding validators to `SITES_BUILD_CHECK_PIPELINE` after `...SITES_CHECK_AUTHOR_PIPELINE`. But the validators (`agent.dns-aid.validate`, `agent.api-catalog.validate`, `agent.mcp-card.validate`) are already inside `SITES_CHECK_AUTHOR_PIPELINE` itself (`sites-check-author.ts:202–207`), not as separate steps in `SITES_BUILD_CHECK_PIPELINE`.

## Axis B — DNA alignment

- **DNA-34 is reclassified to feature.** `satisfies: [DNA-34]` references a DNA invariant that was reclassified to feature by RFC-0161. The DNA entry says: "Reclassified to feature (RFC-0161) — governed as a product feature by RFC-0028, not enforced as binding DNA." The RFC should not satisfy a reclassified DNA. If the RFC needs a DNA reference for `.well-known/` discovery, it should reference the governing RFC (RFC-0028) directly or propose a new binding DNA.

- **DNA-58 referenced in body but not in `satisfies[]`.** Line 97 says "DNA-58 (generated-file determinism) — pipeline runs generators in deterministic order, ensuring reproducible builds." If the RFC claims to enforce DNA-58, it should be listed in `satisfies[]`.

## Axis C — Ecosystem fit

- **`commands.changed` lists pipeline constants, not commands.** The frontmatter `commands.changed` field lists `SITES_BUILD_PREPARE_PIPELINE`, `SITES_BUILD_PREPARE_DEV_PIPELINE`, `SITES_BUILD_CHECK_PIPELINE`. These are pipeline array constants, not kernel commands. The `commands` field is for command names (added/changed/removed), not pipeline definitions. This is a semantic mismatch — pipeline amendments are not command lifecycle changes.

- **Pipeline placement claim doesn't match reality.** The RFC says validators go in `SITES_BUILD_CHECK_PIPELINE` after `SITES_CHECK_AUTHOR_PIPELINE` (line 130). But the actual implementation puts them inside `SITES_CHECK_AUTHOR_PIPELINE` (`sites-check-author.ts:202–207`). The RFC doesn't acknowledge this existing placement and proposes a different one.

## Axis D — Forward-only compliance

No issues. The RFC is additive — no backward compatibility layers, no dual paths.

## Axis E — Agent-facing policy

- **RFC describes a future state as a design proposal, but the code already exists.** The RFC is in `draft` status and proposes pipeline wiring as its Decision. But the commands are already wired into the pipelines by RFC-0783–0786 implementations. The implementation notes (line 200) say "This RFC MUST be implemented after RFC-0783 through RFC-0786 — the pipeline steps reference commands registered by those RFCs." Those RFCs not only registered the commands but also wired them into the pipelines. The RFC should either (a) acknowledge the existing wiring and propose specific changes to it, or (b) be reclassified as a documentation-only RFC describing the final coordinated state.

## Axis F — Pragmatism

- **The RFC may be redundant.** The dependency RFCs (0783–0786) already wired their generators and validators into the pipelines during their own implementation. RFC-0787's stated purpose ("coordinates the wiring") appears already accomplished. The RFC needs to either propose specific changes to the existing wiring (e.g., reordering, dev pipeline exclusions) or explicitly state that it is documenting the existing state for traceability.

- **`agent.markdown-negotiation.generate` is misclassified as a `public/` producer.** Line 161 says "generators that produce `public/` artifacts (api-catalog, mcp-card, dns-aid, markdown-negotiation)." But `agent.markdown-negotiation.generate` writes to `src/middleware/markdown-negotiation.ts` — a `src/` artifact. The actual dev pipeline correctly includes it (`build-prepare.ts:219`) with the comment "needed in dev for testing."

## Axis G — Blind spots

- **Dev pipeline exclusion rationale is wrong for two generators.** The RFC excludes `agent.markdown-negotiation.generate` from the dev pipeline because it's a "public/ producer" (line 161). But it produces `src/middleware/markdown-negotiation.ts`, which IS needed in dev for testing markdown content negotiation. The actual dev pipeline correctly includes it. Similarly, `agent.dns-aid.generate` writes to `systems/<id>/dns-records.yaml` (a workspace-level file, not `public/`), so classifying it as a "public/ producer" is incorrect — it's excluded from dev because it's not needed for `astro dev`, not because it produces `public/` artifacts.

- **No consideration of existing wiring state.** The RFC doesn't check whether the pipelines already contain the proposed steps. An operator reading this RFC would assume the steps need to be added, but they're already present. This could lead to duplicate step insertion or confusion during implementation.

## Questions for the author

1. The dependency RFCs (0783–0786) already wired their generators and validators into the pipelines during implementation. What specific changes does this RFC propose beyond what's already in the codebase? Is this a reordering RFC, a documentation RFC, or is it truly additive?

2. The RFC proposes putting generators after `agent.surface.sign`, but the actual codebase has them before sign (all generators run first, then sign signs the manifest/knowledge/openapi). Which ordering is correct — and if the existing ordering is correct, should the RFC be updated to match it?

3. The RFC classifies `agent.markdown-negotiation.generate` and `agent.dns-aid.generate` as `public/` producers. But the former writes to `src/middleware/` and the latter to `systems/<id>/dns-records.yaml`. Should the dev pipeline inclusion/exclusion rationale be corrected to reflect actual artifact paths?
