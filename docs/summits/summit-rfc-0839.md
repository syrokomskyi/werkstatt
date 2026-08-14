---
rfc: RFC-0839
createdAt: 2026-08-14
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 3
---

# Design Summit: RFC-0839

## Architect

### Findings

- **A1 (concern):** `dependsOn: [RFC-0837, RFC-0838]` creates a hard implementation block (`rfc.implement.stamp` RFC-IMP-07), but both dependencies are still `draft`. If either RFC is rejected or significantly revised before acceptance, RFC-0839's references to DNA-68 and DNA-69 may become stale. The plan should note that implementation cannot proceed until both dependencies are `implemented`.
- **A2 (concern):** The `successSignals` frontmatter declares `active: true` for the methodology, but the Rollout section (step 2) and acceptance criteria both say `active: false` initially. This is a structural inconsistency. The success signal should reflect the initial state (`active: false`) or describe the target state after activation.

### No concerns

- No new command — extends existing `mission.check` via config. This is the right pattern.
- Schema extension is additive (new enum value in `instrumentConfigSchema`). Non-breaking, reversible.
- DNA-70 is clearly scoped and does not conflict with existing invariants.

## Security Engineer

### Findings

No concerns. The RFC does not introduce new trust boundaries — the `mobile-layout` instrument follows the same Axiom pattern as existing methodologies (accessibility, runtime-health, etc.). No PII is processed — findings are about layout geometry. No cookies or client-side persistence. The instrument runs against live URLs, which is the existing Axiom execution model.

## QA Engineer

### Findings

- **Q1 (concern):** The `successSignals` say `active: true` but the rollout says `active: false` initially. An agent verifying success signals against the actual config will find a mismatch. This makes the success signal uncheckable as written. (Consensus with A2.)

### No concerns

- Schema extension is unit-testable: add `mobile-layout` to the enum, verify `parseMethodologiesConfig` accepts it.
- `methodologies.validate` is the integration check — runnable after config changes.
- Failure modes are well-specified: instrument not implemented, methodology inactive, gate aggregation.
- Acceptance criteria are checkable by an agent (schema, config, validate command).

## Product Manager

### Findings

- **P1 (question):** The three-layer strategy (RFC-0837 static CSS → RFC-0838 Playwright pre-deploy → RFC-0839 Axiom post-deploy) is well-motivated. But what is the operational response when the post-deploy check finds a regression? The RFC describes findings and gate behavior but does not describe the remediation workflow. Should there be a documented runbook for "Axiom mobile-layout finding → rollback or hotfix"? This is an operational gap, not a design flaw.

### No concerns

- Rollout risk is low — starts inactive, activated after external implementation.
- Scope is correctly bounded — Werkstatt side is schema + config + docs, external side is instrument.
- `nonGoals` are explicit: doesn't implement the instrument, doesn't replace pre-deploy checks, doesn't add visual regression.

## Developer Advocate

### Findings

- **D1 (question):** The RFC says "the `mobile-layout` instrument must be implemented in `@syrokomskyi/axiom-factory-app`" but does not specify how the external expert discovers this contract. Is there a handoff document, an issue, or is the RFC itself the contract? A brief note like "The instrument contract in § Design is the authoritative specification for the external expert" would close this gap.

### No concerns

- Implementation notes are explicit: "MUST NOT implement the instrument itself" is clear.
- The RFC is self-contained — references the existing Axiom pattern without requiring external context.
- The file system responsibilities table clearly separates Werkstatt-side changes from external changes.

## Consensus findings

- **A2 + Q1 (2 personas — Architect, QA):** `successSignals` frontmatter says `active: true` but Rollout and acceptance criteria say `active: false` initially. This inconsistency makes the success signal uncheckable. **Recommendation:** Update the success signal to say `active: false` initially, or split it into two signals: one for initial declaration (`active: false`) and one for post-activation (`active: true`).

## Unique findings

- **A1 (Architect):** `dependsOn` on two draft RFCs creates a stale-reference risk. Note in the plan that implementation is blocked until both are `implemented`.
- **P1 (Product Manager):** No documented remediation workflow for post-deploy findings. Consider adding a brief operational note or deferring to a separate runbook.
- **D1 (Developer Advocate):** Clarify that the RFC's § Design is the authoritative contract for the external expert.

## Recommendation

**Revise the RFC** — one consensus finding (successSignals inconsistency) should be fixed before acceptance. The unique findings are minor and can be addressed during enhancement. Route through `fo-idea-enhance` to apply the consensus finding and optionally the unique findings.

No findings does not mean no issues — it means no issues were found from these five perspectives.
