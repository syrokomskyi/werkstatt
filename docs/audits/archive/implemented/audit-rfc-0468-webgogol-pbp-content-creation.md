---
rfcId: RFC-0468
auditId: AUDIT-RFC-0468-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0468

## Verdict: Approved

The RFC is a thorough content migration plan with exact field-level mappings from legacy `@gogol/business` files to PBP entities. It correctly references the spec blueprint and migration agent plan. The owner decision register and migration coverage report are well-designed. Minor findings on ecosystem fit and anti-fabrication do not block implementation.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Decision** is present tense and specific: content tree structure, 20-phase migration, owner decision register, coverage report.
- **CLI surface** correctly states "No CLI command. Content files are authored manually by the migration agent."
- **TypeScript contracts** — N/A (content RFC, no code contracts). Correct.
- **File system responsibilities** table names 5 concrete path patterns.
- **Output format** — N/A (content files). Correct.
- **Failure modes** covers schema validation, reference resolution, owner decisions, coverage gaps.
- **Rollout** describes coexistence, owner decision lifecycle, dependency chain.
- **Alternatives considered** has 3 real alternatives with rejection reasons.
- **Risks** covers incomplete migration, owner decision latency, content drift, entity count.
- **Acceptance criteria** — 25 items, all checkable.
- **Implementation notes** — 10 explicit behavioral rules including migration branch, no legacy deletion, no content.config.ts changes, draft status for blocked entities.
- No issues.

## Axis B — DNA alignment

- **DNA-1 (Monorepo boundary):** Content files in `systems/warpgogol-com/src/content/`, schemas/compiler in `packages/pbp/`. Correctly separated.
- **DNA-20 (Business layer):** This RFC creates the PBP content that will replace `@gogol/business` content. Both coexist until RFC-0470. Forward-only — no backward compatibility.
- **DNA-55 (Spec vendoring):** Entity field values reference `pbp-specification-package/target-blueprint` sections. Correct.
- `satisfies: [DNA-1, DNA-20]` — both are real invariants and the RFC body explains how each is enforced.
- No issues.

## Axis C — Ecosystem fit

- **Package boundaries:** Content in site workspace, schemas in package. Correct.
- **Pipeline placement:** Not applicable — content creation, no build pipeline hooks.
- **Compass sync:** Not applicable — no repository-wide requirement changes.
- **AGENTS.md updates:** The RFC does not mention updating `systems/warpgogol-com/AGENTS.md` with the new `business-profile/` content directory. **Minor finding — the site's AGENTS.md should document the new content tree.**
- **Cosmic naming:** Not applicable — content files, not manifests.
- **Command lifecycle:** All empty. Correct — no CLI commands.
- No blocking issues.

## Axis D — Forward-only compliance

- No compatibility shims. Legacy `business/` and new `business-profile/` coexist, but the RFC explicitly states this is not a dual-path — the site still reads from `business/` until RFC-0469 switches over. This is a migration staging pattern, not a compatibility layer.
- No backward compatibility. Legacy files are not modified.
- No issues.

## Axis E — Agent-facing policy

- **Status gate:** RFC is `draft`. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes** reference RFC-0224, RFC-0334. Correct.
- **Anti-fabrication:** The RFC distinguishes between agent-created content (entity .md files with field mappings) and human-required content (owner decisions). Entities with open blocking decisions have `status: draft`. The RFC states "No `TODO`, `TBD`, or `unknown` in published canonical fields — use `not-declared` semantic status." This correctly separates agent and human responsibilities. **However**, the RFC says the migration agent creates content files — some of these contain business-specific prose (descriptions, mission statements, claim statements) that may require human authoring, not just field mapping. The RFC should clarify which prose fields are auto-mapped from legacy vs. which require human authoring. **Minor finding.**
- **Storage policy:** Not applicable — content files only.
- No blocking issues.

## Axis F — Pragmatism

- **Minimal command surface:** No CLI commands. Correct.
- **Lean contracts:** N/A — content RFC.
- **Existing patterns:** The RFC follows the existing `src/content/business/{lang}/` pattern with the new `src/content/business-profile/{lang}/` directory. Consistent.
- **Scope discipline:** `appsImpacted: ["warpgogol-com"]`, `packagesImpacted: ["@gogol/pbp"]`. Correct. `nonGoals` are explicit and meaningful — 7 items covering what this RFC does not do.
- **Entity ID scheme:** Uses HTTPS URIs per blueprint convention. Clean and consistent.
- No issues.

## Axis G — Blind spots

- **Performance:** Not applicable — content creation, not build-time processing.
- **False positives:** Not applicable — no validators.
- **Edge cases:** The RFC considers draft entities (blocked by owner decisions), unmapped fields, and content drift. Does not explicitly consider what happens if legacy files are modified during migration (content drift). The risks section mentions it but the mitigation (migration branch) is adequate.
- **Migration path:** The 20-phase migration plan is well-documented with exact field mappings. The `PbpMigrationMapping` records track each field. Good.
- **Security/privacy:** The RFC explicitly excludes bank account numbers, tax IDs (ADR-036) from `legal-identity.md`. Phase 10 semantic validation checks for sensitive data. Adequate.
- **Localization:** The RFC creates `uk/` locale overrides for only 2 entities (business.md and digital-foundation.md product). This is explicitly scoped as structural stubs — full localization is Phase 18. Adequate.
- No blocking issues.

## Questions for the author

1. Which prose fields (descriptions, mission, claim statements) are auto-mapped from legacy content vs. which require human authoring? The RFC should clarify the boundary between agent-mapped and human-authored content.
2. The `owner-decision-register.yaml` lists 28 items but only items 1-3 are shown in the RFC. Will the full register be created during implementation from the migration plan §28, or does the operator need to provide the complete list?
3. Should `systems/warpgogol-com/AGENTS.md` be updated as part of this RFC to document the new `business-profile/` content directory and its relationship to the legacy `business/` directory?
