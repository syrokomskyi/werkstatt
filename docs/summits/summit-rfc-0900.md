---
rfc: RFC-0900
createdAt: 2026-08-21
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 4
---

# Design Summit: RFC-0900

Add client-testimonial PBP entity and gratitude-section for client gratitude display on Nachweise page.

## Architect

### Findings

- **A1 (concern):** The RFC proposes adding `gratitude-section` to `packages/werkstatt-site/src/domain/ui/sections/gratitude/` but does not explicitly mention updating the `planetImportPaths` map in `index.yaml`. The `uni.registry.build` command should handle this automatically, but the plan (Step 5) does verify this — so this is adequately covered.
- **A2 (question):** The RFC says `evidenceRef` is an opaque string, but the `gratitude-section.astro` component renders a link to `/{lang}/nachweise/{evidenceRef}`. If `evidenceRef` is an entity ID (not a slug), the URL may not resolve correctly. Nachweis detail pages are routed by slug, not entity ID. This needs clarification: is `evidenceRef` an entity ID or a slug?

### No concerns

- The entity follows the established PBP pattern (extending `pbpEntitySchema`, registering in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`).
- The archetype follows the established YAML pattern (matching `faq-list.yaml`, `hero.yaml`).
- DNA-5 (Mirror Quintet) is respected — all five artifacts are listed.
- DNA-17 (Uni manifest contract) is respected — manifest declares all required fields.

## Security Engineer

### Findings

- **S1 (concern):** Client testimonials display author names, roles, and organizations. The RFC does not mention consent verification — whether the client has agreed to have their name and organization publicly displayed on the website. The `consent` PBP entity exists for exactly this purpose. The RFC should either (a) require a `consentRef` field linking to a `consent` entity, or (b) explicitly state that testimonial content authoring implies consent and reference the consent workflow.

### No concerns

- No new trust boundaries are created — testimonials are build-time content, no client-side fetching.
- No cookies or client-side storage introduced.
- No unauthenticated paths to sensitive data — testimonials are public content by design.

## QA Engineer

### Findings

- **Q1 (concern):** The acceptance criterion "Section is hidden on `/uk/nachweise` when no UK testimonials exist (empty state)" is testable via Playwright but is not covered by a unit test in the plan. The plan should add an integration test or Playwright test for the empty-state behavior.
- **Q2 (question):** What happens if a testimonial has `status: draft` but is the only one for a locale? The section should be hidden (no published testimonials). This is implied but not explicitly tested. The plan's Step 2 schema tests verify status validation, but no test verifies the section's filter logic (`status === "published"`).

### No concerns

- Schema unit tests in Step 2 cover valid/invalid entity validation well.
- `pbp.content.validate` covers content-level validation.
- Failure modes section in the RFC is thorough.

## Product Manager

### Findings

- **P1 (concern):** The RFC does not specify a maximum number of testimonials to display. If a site accumulates 50+ testimonials, the 2-column grid could become very long. Should there be a limit (e.g., display first 6, with a "show more" expansion)? Or is unlimited display acceptable since testimonials are curated content?

### No concerns

- The problem statement is grounded in a real user need — client gratitude complements cryptographic evidence.
- Rollout is opt-in per site, no migration needed.
- `nonGoals` are explicit and meaningful (no new commands, no evidence-source changes, no photo upload).
- Scope is correctly bounded — one entity, one section, one page.

## Developer Advocate

### Findings

- **D1 (concern):** The RFC's `Implementation notes for agents` section is thorough but does not mention the `pbpEntityDiscriminatedUnion` registration. An agent implementing this RFC might forget to add the new schema to the discriminated union array, not just `pbpSchemaById`. The plan (Step 1) does mention this, but the RFC itself should note it in the implementation notes.

### No concerns

- The RFC is self-contained and references all related RFCs (0706, 0708).
- The file system responsibilities table is comprehensive.
- The CLI surface section provides copy-pasteable commands.
- The failure modes section helps agents diagnose issues.

## Consensus findings

- **A2 + S1 (2 personas):** `evidenceRef` semantics and consent. The Architect notes that `evidenceRef` may be an entity ID vs. slug mismatch for URL routing. The Security Engineer notes the lack of consent verification. These are related: if `evidenceRef` links to an evidence-source entity, the consent for displaying the client's name should be verified. Recommendation: clarify in the RFC that `evidenceRef` is an evidence-source entity ID (not a slug), and the link target should resolve through the evidence-source's `slug` field. Add a note that testimonial content authoring implies the client has consented to public display of their name and quote.

## Unique findings

- **A1:** Verify `planetImportPaths` update after `uni.registry.build` — covered in plan Step 5.
- **Q1:** Add integration/Playwright test for empty-state behavior — plan should be updated.
- **Q2:** Add test for section filter logic (`status === "published"` excludes draft) — plan should be updated.
- **P1:** Consider maximum testimonial count or curation policy — minor, can be deferred.
- **D1:** RFC implementation notes should mention `pbpEntityDiscriminatedUnion` registration — plan Step 1 covers it.

## Recommendation

**Proceed to acceptance with minor revisions.** The consensus finding (A2 + S1) should be addressed by a small RFC text amendment:
1. Clarify `evidenceRef` is an evidence-source entity ID; the link should resolve via the evidence-source's `slug` field.
2. Add a note that testimonial content authoring implies client consent for public display.

The unique QA findings (Q1, Q2) should be addressed by updating the plan to include integration tests for empty-state and filter logic.

No findings require blocking acceptance. The RFC is architecturally sound, security-conscious (with the consent note added), and well-scoped.

---

*No findings does not mean no issues — it means no issues were found from these five perspectives.*
