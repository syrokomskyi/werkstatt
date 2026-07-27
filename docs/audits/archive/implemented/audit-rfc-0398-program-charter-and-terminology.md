---
rfcId: RFC-0398
auditId: AUDIT-RFC-0398-01
date: 2026-07-19
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0398

## Verdict: Approved

The RFC is a well-structured charter that establishes normative terminology, architectural layers, and namespace policy for the PBP RFC program without over-reaching into implementation. No failures on axes B, D, or E. One minor finding on axis C (Compass sync not explicitly identified). The three questions are advisory for downstream RFCs, not blockers for this charter.

## Mechanical validation (rfc.validate)

Pass (with 1 warning).

- **V-20 (warning):** `specRef` is an unknown frontmatter key (not in the RFC schema). This is expected — `specRef` was introduced by RFC-0396 (spec materialization) and the `rfc.validate` schema has not yet been updated to recognize it. The field is set correctly by `spec.materialize` and is semantically valid. Not a blocker.
- **V-24 (error → fixed):** Initially failed because `satisfies` was empty. Fixed by adding `DNA-55` (spec vendoring contract) — the charter is the first materialized RFC from the vendored spec, protecting DNA-55 by demonstrating the contract works end-to-end.

## Axis A — Structural completeness

No issues.

- **Decision** is in present tense, clearly structured into 8 numbered subsections.
- **CLI surface / TypeScript contracts / File system responsibilities / Output format / Failure modes** are all explicitly N/A — the RFC states "This RFC is a charter — it establishes terminology and policy, not code." This is correct for a charter RFC and not a template placeholder.
- **Rollout** describes adoption path (immediate, no flag day, supersession path, Wave 1 scope).
- **Alternatives considered** has 4 real alternatives with rejection reasons grounded in ADRs.
- **Risks** has 4 risks with mitigations, including agent misinterpretation risk ("DNA-20 limbo").
- **Acceptance criteria** are checkable — 7 marked [x] (already met by the charter content), 2 marked [ ] (post-implementation tasks).
- **Implementation notes** are explicit behavioral rules referencing RFC-0224 and RFC-0334.

## Axis B — DNA alignment

No issues.

- `satisfies: [DNA-55]` — the RFC body explains it is "the first materialized RFC from the `pbp-specification-package` spec" and follows RFC-0394/0395/0396. This protects DNA-55 by exercising the spec vendoring contract end-to-end (integrity → forge-spec → materialize → RFC with specRef).
- `related: [DNA-20, DNA-55, RFC-0394, RFC-0395, RFC-0396]` — all relevant and not decorative. DNA-20 is the supersession target, DNA-55 is the spec contract, RFC-0394/0395/0396 are the spec lifecycle RFCs.
- No silent conflict with DNA-20 — the RFC explicitly declares the supersession path: "DNA-20 is superseded when RFC-PBP-103 (Migration Coverage and Cutover) is implemented and legacy `@gogol/business` files are deleted."
- Does not establish a new DNA invariant — correct for a charter.

## Axis C — Ecosystem fit

Minor finding.

- **Package boundaries:** `packages/pbp/` is proposed in `packages/*` (correct per DNA-1). Site-local `src/content/business/` preserves DNA-4. No cross-app imports. ✓
- **Pipeline placement:** N/A (no new commands). ✓
- **Compass sync:** **Minor finding** — the RFC does not explicitly identify which `docs/*.xml` files need synchronization. Since the charter establishes a new program that will eventually change repository-wide requirements and app-package relationships, `docs/requirements.xml` and `docs/technology.xml` may need updates. However, since this is a charter (no code changes), Compass sync can wait until implementation of downstream RFCs (RFC-PBP-001). Not a blocker.
- **AGENTS.md updates:** Acceptance criteria include `AGENTS.md` and `packages/business/AGENTS.md` updates, deferred to implementation. ✓
- **Cosmic naming:** Explicitly excluded in nonGoals ("Does not define cosmic naming or UI taxonomy — PBP is a data layer, not a UI layer"). ✓
- **Command lifecycle:** No commands proposed. ✓

## Axis D — Forward-only compliance

No issues.

- No compatibility shim or dual-path. The RFC explicitly states "no compatibility layer" (ADR-043) and "Old files are deleted after 100% coverage and clean build. Forward-only."
- DNA-20 supersession is through RFC-PBP-103, not a parallel interpretation.
- No legacy code paths maintained behind a flag.

## Axis E — Agent-facing policy

No issues.

- **Status gate:** No self-authorizing language. The RFC states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes** reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict). ✓
- **Anti-fabrication:** N/A (no content authoring in acceptance criteria). ✓
- **Storage policy:** N/A (no persistence). ✓

## Axis F — Pragmatism

No issues.

- **Minimal command surface:** No commands. ✓
- **Lean contracts:** No TypeScript types (charter). ✓
- **Existing patterns:** Explains why extending `@gogol/business` is insufficient (flat `.md` files with presentation strings cannot represent Charge/Plan/Adjustment, federated product identity, typed Policies, or Claims with Evidence). ✓
- **Scope discipline:** `appsImpacted: [webgogol-com]`, `packagesImpacted: [@gogol/business, @gogol/ontology]`. `nonGoals` are 5 meaningful items, not boilerplate. ✓

## Axis G — Blind spots

No issues.

- **Performance:** N/A (no commands). ✓
- **False positives:** N/A (no validators). ✓
- **Edge cases:** Considers "DNA-20 limbo" during construction — both `@gogol/business` and `packages/pbp/` coexist. Mitigation documented. ✓
- **Migration path:** Documented — no flag day, PBP constructed alongside `@gogol/business`, no existing site changes until RFC-PBP-102. ✓
- **Security/privacy:** N/A (no user data, PII, or external services). ✓

## Questions for the author

1. The RFC lists `@gogol/ontology` in `packagesImpacted` but does not mention it in the RFC body. What specific changes to `@gogol/ontology` does this RFC anticipate? Should it be removed if the impact flows only through downstream RFCs (e.g. RFC-PBP-001 establishing `packages/pbp/` may import from or extend ontology)?
2. The architectural layers table maps "Governance" to `docs/specs/pbp-specification-package/` (spec) + `docs/rfcs/` (RFCs) — but the spec is an immutable vendored snapshot (DNA-55). Should the governance layer description clarify that changes to the spec flow only through amendments (RFC-0397), not direct edits?
3. The RFC declares `pbp/*@1` as the namespace — but where is this namespace physically anchored? Is it a package name, a schema `$id` prefix, or both? RFC-PBP-001 should clarify this, but the charter should state whether `pbp/*@1` is already binding or becomes binding only when RFC-PBP-001 is implemented.
