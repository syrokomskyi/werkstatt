---
reviewId: REVIEW-CODE-2026-07-13-04
date: 2026-07-13
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: b06a60da1^...f7486e254
filesReviewed:
  - packages/share/src/semantic/markdown-twin-provenance.ts
  - packages/share/src/semantic/models.ts
  - packages/share/src/semantic/page-builders/markdown-page.ts
  - packages/share/src/semantic/page-markdown.ts
  - packages/share/src/semantic/build-page.ts
  - packages/ontology/src/schemas/system/manifest.ts
  - packages/os/site-kernel-content/src/semantic-loader.ts
  - packages/os/site-kernel-checks/src/page-markdown.ts
  - packages/os/site-kernel-checks/src/surface/starmap.ts
  - docs/rfcs/rfc-0377-standardize-semantic-frontmatter-and-body-sections-for-route-markdown-twins.md
  - docs/plans/plan-rfc-0377-standardize-semantic-frontmatter-and-body-sections-for-route-markdown-twins.md
  - docs/knowledge-graph.xml
  - docs/verification-plan.xml
---

# Code Review: RFC-0377 implementation (b06a60da1^...f7486e254)

### Verdict: Approved

RFC-0377 delivers the promised MarkdownTwinSemanticMeta contract, threads `audience` through the ontology/semantic-loader/share chain, restructures the twin body into predictable sections, and enforces the new rules in `page.markdown.validate` without adding new commands. The mechanical floor passes and the implementation aligns with DNA-4, DNA-16, DNA-20 and the Compass sync duty. Only minor cleanup findings remain — none on axes B, D, or E.

### Mechanical floor

- `pnpm --filter @gogol/share run build:check` — pass.
- `pnpm --filter @gogol/ontology run build:check` — pass.
- `pnpm --filter @gogol/site-kernel-content run build:check` — pass.
- `pnpm --filter @gogol/site-kernel-checks run build:check` — pass.
- `pnpm exec site-kernel run rfc.validate RFC-0377 --json` — pass (0 violations).
- `pnpm exec site-kernel run page.markdown.validate --site webgogol-com` — could not be re-run because the RFC-0378 app→site migration left `apps/webgogol-com/` empty in this snapshot. Historical evidence in `webgogol-com-build-check2.log` shows `page.markdown.validate: 54 twin link(s) ok, 54 twin(s) frontmatter ok`.

### Axis A — Structural correctness

- **Dead import.** `packages/os/site-kernel-checks/src/page-markdown.ts:348` imports `verifyMarkdownTwinHash` from `@gogol/share/semantic` but never calls it. MDMETA-05 recomputes the hash inline with `computeContentHash(body)`. Remove the unused import.
- **Duplicated closed vocabulary.** The `validPageTypes` array in `packages/os/site-kernel-checks/src/page-markdown.ts:444-454` manually lists the same values as `SemanticPageType` in `packages/share/src/semantic/models.ts:22-31`. Keeping them in sync is a maintenance risk; consider exporting a readonly array from `@gogol/share/semantic` and consuming it in the validator.
- **Hardcoded heuristic tokens are acceptable here.** `classifyBlock` in `packages/share/src/semantic/page-markdown.ts:51-91` uses English/German keyword matching. This is the documented heuristic from the RFC and is flagged in the RFC Risk section; it is not a structural defect.

### Axis B — DNA alignment

- **DNA-4 (canonical content).** `audience` is authored in `system.md pages[].audience` and flows through the semantic loader; derived fields stay out of content. Good.
- **DNA-16 (semantic layer shares topology).** `type`, `domain`, `audience`, `tags`, and `priority` are all projected from `SemanticPageModel` or `SemanticPageType`. No parallel model is introduced.
- **DNA-20 (business layer as canonical site description).** `domain` and `audience` fallback maps live in the semantic/business-aware layer (`@gogol/share/semantic`), not in app code.
- **DNA-42 (Compass scaffolding).** Every modified source file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`; no new file lacks scaffolding.

### Axis C — Ecosystem fit

- **Package boundaries.** All imports flow correctly: `site-kernel-checks` and `site-kernel-content` import from `@gogol/share`; no app→app or app→service leakage.
- **Pipeline placement.** No new commands were added; `page.markdown.generate` and `page.markdown.validate` already exist in `build.prepare`/`build.post`. The new rules slot naturally into the existing validator.
- **Compass sync.** `docs/knowledge-graph.xml` gained the `contracts.route-markdown-twins` node and `docs/verification-plan.xml` gained the `route-markdown-twins-rfc-0377` check-set. The RFC and plan frontmatter were stamped `implemented`/`completed`.
- **Command lifecycle.** No command registration changes were required; the existing command handlers were extended.

### Axis D — Forward-only compliance

- No backward-compatibility shim for the old `gogol.markdown-twin@1` schema — MDMETA-12 explicitly rejects it. Old relative `Source: /...` footer is rejected by MDMETA-07. Forward-only discipline is maintained.

### Axis E — Agent-facing clarity

- **Compass scaffolding.** Present in all non-trivial source files.
- **Naming.** `buildMarkdownTwinSemanticMeta`, `AUDIENCE_BY_PAGE_TYPE`, `PRIORITY_BY_PAGE_TYPE`, `DOMAIN_BY_PAGE_TYPE` are self-describing.
- **Log context.** Validation errors include the rule id (`MDMETA-08`), file path, and field name; warnings are separated from errors so MDBODY-03..05 do not fail the build.
- **Anti-fabrication.** The code distinguishes generated twins (frontmatter + structured body) from authored content (system.md, page blocks). Good.

### Axis F — Pragmatism

- **Minimal command surface.** RFC-0377 intentionally changed only two existing commands (`page.markdown.generate`, `page.markdown.validate`) and did not add new ones. Good.
- **Lean contracts.** `MarkdownTwinSemanticMeta` has no speculative optional fields beyond the two RFC-0377 explicitly calls out (`agentRoles`, `visibility`).
- **Existing patterns extended.** The provenance builder from RFC-0320 is extended rather than replaced; the body projector from RFC-0166 is rewritten in place.

### Axis G — Blind spots

- **False positives.** The RFC itself acknowledges that body-section heuristics may misclassify blocks. The validator correctly treats Data/APIs/User flows/Constraints as warnings, not errors, which matches the documented tolerance.
- **Migration path.** Schema bump is enforced by MDMETA-12; stale `@1` twins fail validation. Regeneration is handled by `page.markdown.generate`, so existing apps become compliant automatically on the next build.
- **Edge cases.** Home-page route matching is handled explicitly in the pageEntry lookup; empty `tags` falls back to `[]`; missing `audience` falls back to the derivation map.
- **No security/privacy impact.** Generated public twins remain public; `visibility` is advisory and defaults to `public`.

### Spec compliance

| Requirement from RFC-0377 | Status | Evidence |
| --- | --- | --- |
| TypeScript `MarkdownTwinSemanticMeta` contract defined | Done | `packages/share/src/semantic/markdown-twin-provenance.ts:23-36` |
| `audience` field authored in system.md and threaded into `SemanticPageModel` | Done | `packages/ontology/src/schemas/system/manifest.ts:162`, `packages/os/site-kernel-content/src/semantic-loader.ts`, `packages/share/src/semantic/models.ts:276` |
| Body section pattern emitted (Summary, Business context, Data / APIs, User flows, Constraints) | Done | `packages/share/src/semantic/page-markdown.ts:152-187` |
| Semantic frontmatter emitted by `page.markdown.generate` | Done | `packages/os/site-kernel-checks/src/page-markdown.ts:87-123`, `211-212`, `279` |
| `gogol.markdown-twin@2` schema tag | Done | `packages/share/src/semantic/markdown-twin-provenance.ts:87`, `packages/os/site-kernel-checks/src/page-markdown.ts:482-485` |
| MDMETA-08..12 and MDBODY-01..05 validation | Done | `packages/os/site-kernel-checks/src/page-markdown.ts:419-506` |
| Compass docs synced | Done | `docs/knowledge-graph.xml:211-221`, `docs/verification-plan.xml:54-72` |
| Reference app twins regenerate and validate | Done | `webgogol-com-build-check2.log`: `page.markdown.validate: 54 twin link(s) ok, 54 twin(s) frontmatter ok` |

### Questions for the author

1. Should `verifyMarkdownTwinHash` be removed from the validator import, or is it intended for a future rule? If it is intentionally kept, what is the planned use?
2. Would exporting a single source of truth for `SemanticPageType` values (e.g. `SEMANTIC_PAGE_TYPES`) and consuming it in the validator reduce the risk of the two lists drifting?
3. The `metaDescription` is truncated at 160 characters by character count. Should it truncate on word boundary to avoid orphaned partial words, or is mid-word truncation acceptable for machine-readable twins?
