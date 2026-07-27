---
rfcId: RFC-0377
auditId: AUDIT-RFC-0377-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0377 — Standardize semantic frontmatter and body sections for route Markdown twins

## Verdict: Approved

RFC-0377 is a well-scoped contract amendment that extends RFC-0320 with semantic metadata and a predictable body structure for generated route Markdown twins. The decision is concrete, the DNA alignment is explicit, and the forward-only schema bump from `gogol.markdown-twin@1` to `@2` is clean. The audit found no failures on axes B, D, or E. Two minor findings on ecosystem documentation and blind spots are noted below and can be addressed during the enhance/plan phase.

## Mechanical validation (rfc.validate)

Pass — zero violations after syncing `amendedBy` on RFC-0320, RFC-0166, and RFC-0208.

## Axis A — Structural completeness

No issues. All required sections are filled, the Decision is a single present-tense statement, CLI surface uses exact command invocations, TypeScript contracts are minimal, file system responsibilities are concrete, and acceptance criteria are checkable.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-4, DNA-16, DNA-20]` are real invariants, and the Architectural fit section explains how each is protected or extended. The RFC does not establish new DNA invariants silently.

## Axis C — Ecosystem fit

**Minor finding:** Compass sync is under-specified. The RFC changes a shared package contract (`@gogol/share` frontmatter builder) and a cross-workspace generated-file shape. Root `AGENTS.md` Compass document duties require synchronization of `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`, and `docs/source-markup.xml` when repository-wide requirements or shared package contracts change. The RFC should identify which Compass files need updates, or explicitly state that none are affected because the change is purely a generated-file format.

Package boundaries and pipeline placement are correct. `apps/*` is not impacted directly; changes live in `packages/*` and `packages/os/*`. No new commands are introduced — only `page.markdown.generate` and `page.markdown.validate` are changed.

## Axis D — Forward-only compliance

No issues. The schema tag bumps from `gogol.markdown-twin@1` to `@2` with no backward compatibility layer, and `MDMETA-12` rejects stale `@1` twins. This matches the ecosystem's forward-only discipline.

## Axis E — Agent-facing policy

No issues. The RFC contains no self-authorizing language. Implementation notes reference RFC-0224, RFC-0330, and RFC-0334 correctly. The optional `audience` field is the only content-authoring touchpoint; all other semantic fields are derived, so anti-fabrication concerns are minimal.

## Axis F — Pragmatism

No issues. The command surface is minimal (no new commands), contracts are lean, and the hybrid authored+derived `audience` approach balances flexibility with zero-authoring-burden defaults. `appsImpacted` and `packagesImpacted` are accurate.

## Axis G — Blind spots

**Minor finding:** Performance cost of body section mapping is not quantified. The RFC proposes heuristics to map `SemanticBlock[]` into five standardized sections for every generated twin. This happens once per page during `build.prepare`, so the absolute cost is small, but the RFC should state that the mapping is O(blocks) and does not require additional file system scans beyond the existing semantic model.

**Minor finding:** Edge case for empty `lead` and `description` is not explicitly handled. The `## Summary` section is required (`MDBODY-01`), but the RFC assumes every page has a lead or description. If both are missing, the generator must either fail with a clear diagnostic or fall back to the first block summary. The RFC should specify the fallback behavior.

## Questions for the author

1. **Compass sync:** Which `docs/*.xml` files (if any) should be updated when this RFC is implemented? If none, please state that explicitly in the Design or Rollout section.
2. **Empty summary edge case:** If a page has neither `lead` nor `description`, what fills the `## Summary` section — the first block summary, a failure, or a placeholder? Please clarify in the body section builder contract.
3. **`agentRoles` derivation:** The RFC lists `agentRoles` as optional but does not specify how it is derived. Should it be omitted entirely for v1, or should it be derived from `type`/`domain`? If derived, where does the mapping live?
