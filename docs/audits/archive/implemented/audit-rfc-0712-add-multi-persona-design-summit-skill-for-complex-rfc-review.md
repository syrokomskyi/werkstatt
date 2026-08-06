---
rfcId: RFC-0712
auditId: AUDIT-RFC-0712-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0712

## Verdict: Needs revision

RFC-0712 proposes a well-structured `fo-design-summit` skill with clear process, persona definitions, and invocation criteria. However, the skill concern is misclassified as `read-only` when it writes summit reports to disk (should be `document-only`), the DNA-54 alignment is claimed but `ref()` notation is not shown in the skill design, and a trigger overlaps with the existing `grilling` skill.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Decision** is present tense and concrete: "Add a `fo-design-summit` skill that simulates a multi-persona design discussion."
- **CLI surface** is intentionally absent — the RFC explicitly states "No new Site OS commands." This is appropriate for a skill-only feature.
- **TypeScript contracts** are absent — acceptable since the skill produces markdown, not code. The summit report format is defined as a markdown template with YAML frontmatter, which is sufficient.
- **File system responsibilities** table names concrete paths (`docs/summits/summit-<rfc-id>.md`, `docs/rfcs/rfc-*.md`, `docs/audits/audit-*.md`).
- **Output format** (summit report) is documented with a full example.
- **Failure modes** specifies 4 cases with handling.
- **Rollout** describes default behavior, migration, pipeline integration, skill sync.
- **Alternatives considered** has 4 real alternatives with rejection reasons.
- **Risks** includes agent misinterpretation risk (persona caricature) and false-positive concern (false confidence from clean summit).
- **Acceptance criteria** are 10 checkable items.
- **Implementation notes** are explicit MAY/MUST NOT rules.

No issues.

## Axis B — DNA alignment

- **Finding B1 (concern):** `satisfies: [DNA-54]` claims Forge bindings contract alignment. The RFC body says "The `fo-design-summit` skill follows the Forge bindings contract — no hardcoded project literals in skill instruction lines." However, the skill design in §Design shows the process step as "Read the RFC file and its related context (DNA invariants, related RFCs, affected packages)" — this uses the literal "DNA invariants" instead of `ref(forge.yaml bindings.paths.invariantsFile)`. The actual SKILL.md must use `ref()` notation to comply with DNA-54/SKILL-11. The RFC should explicitly state that the skill instructions will use `ref(forge.yaml bindings.paths.invariantsFile)`.

## Axis C — Ecosystem fit

- **Finding C1 (concern):** `packages/forge/AGENTS.md` currently states "44 skills" in the Skills section. Adding `fo-design-summit` will make it 45. The RFC does not mention updating `packages/forge/AGENTS.md` to reflect the new skill count. While this is a documentation sync that would happen during implementation, the RFC should note it in `packagesImpacted` or in the Rollout section.
- **Package boundaries** are correct — the skill lives in `packages/forge/skills/fo/fo-design-summit/`, the standard location.
- **`fo-idea-plan` modification** (step 5b) is a change to an existing skill's instructions, not a new command. The `commands.changed` field is correctly empty since no Site OS commands change.
- **No Compass sync** needed — the RFC doesn't change repository-wide requirements or shared package contracts.

## Axis D — Forward-only compliance

No issues. The RFC adds a new skill without introducing compatibility layers, shims, or dual-paths. No legacy code paths to remove.

## Axis E — Agent-facing policy

- **Finding E1 (concern):** The skill is declared `concern: read-only` in the YAML frontmatter, but the skill writes summit reports to `docs/summits/summit-<rfc-id>.md`. The four-level taxonomy (RFC-0523) defines `read-only` as "no file modifications" and `document-only` as "modifies `.md` files only." Since the skill produces a markdown file, the correct concern is `document-only`. The implementation notes even confirm: "it must not modify the RFC, source code, or any file except the summit report in `docs/summits/`" — which contradicts `read-only` since it DOES write a file. `skill.validate` (SKILL-12) may flag this mismatch.
- **Status gate** is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **No self-authorizing language** — the RFC clearly states the summit report "does not block RFC acceptance — the operator decides."
- **Anti-fabrication** is addressed — the summit report explicitly states "no findings does not mean no issues."

## Axis F — Pragmatism

- **Minimal command surface** — no new commands, just a skill. Appropriate.
- **`dependsOn: ['fo-idea-audit']`** is justified — the summit reads the audit report to avoid duplicating findings.
- **Invocation criteria** are clear and not overly broad (5 criteria, any-of).
- **500-word threshold** for "too small" is a reasonable heuristic.
- **`nonGoals`** are explicit and meaningful (5 items, each with a clear boundary).

No issues.

## Axis G — Blind spots

- **Finding G1 (concern):** The trigger `"stress-test this design"` overlaps with the `grilling` skill's purpose. The `grilling` skill is described as stress-testing plans and designs. When an operator says "stress-test this design," it is ambiguous whether they mean one-on-one grilling or a multi-persona summit. This could cause skill routing confusion. Recommend removing `"stress-test this design"` from the triggers or renaming it to `"design summit stress-test"` to disambiguate.
- **Performance** — not a concern. The skill runs in a single session, reading the RFC and related context. No build-time cost.
- **Edge cases** are well-covered: RFC not found, audit not run yet, RFC too small, persona findings overlap.
- **Migration path** — no migration needed (new artifact type).
- **Security/privacy** — not applicable (no user data, PII, or external services).

## Questions for the author

1. The skill is declared `concern: read-only` but writes summit reports to `docs/summits/`. Should this be `document-only` to match the four-level taxonomy (RFC-0523)?
2. The RFC claims DNA-54 alignment but the skill design doesn't show `ref(forge.yaml bindings.paths.invariantsFile)` notation. Will the actual SKILL.md use `ref()` for the invariants file path?
3. The trigger `"stress-test this design"` overlaps with the `grilling` skill. Should this trigger be removed or renamed to avoid routing ambiguity?
4. Should the RFC mention updating `packages/forge/AGENTS.md` (currently "44 skills") to reflect the new skill count?
