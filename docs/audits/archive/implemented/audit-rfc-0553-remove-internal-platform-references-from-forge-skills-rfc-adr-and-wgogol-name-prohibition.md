---
rfcId: RFC-0553
auditId: AUDIT-RFC-0553-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0553

## Verdict: Needs revision

The RFC proposes prohibiting "RFC" and "ADR" terms in forge skill files, but forge IS an RFC/ADR governance framework — its `package.json` description reads "Framework for documenting and implementing ideas — RFC/ADR governance, skills, and project bootstrapping" with keywords `["rfc", "adr", "governance"]`. 470 RFC matches across 31 files and 175 ADR matches across 22 files are not incidental leakage; they are the skills' core vocabulary. The "WGogol" name prohibition (14 matches, 7 files) is defensible and should be salvaged, but the RFC/ADR prohibition as written is unimplementable and must be dropped or radically narrowed.

## Mechanical validation (rfc.validate)

Pass — zero violations targeting RFC-0553.

## Axis A — Structural completeness

- **Decision** is present and clear: "SKILL-17 is added to `forge.skill.validate`". Present tense, single decision. OK.
- **CLI surface** does not show exact command invocations. The RFC mentions `forge.skill.validate` but does not show the `--json` output shape or exact flags. Minor.
- **File system responsibilities** table names two concrete paths. OK.
- **Failure modes** specifies false positives and binding key names but does not specify exit codes or warn-vs-fail behavior. Minor.
- **Rollout** describes default behavior, existing skill cleanup, and new skill compliance. OK.
- **Alternatives considered** has three real alternatives with rejection reasons. OK.
- **Risks** covers false positives, binding keys, cleanup errors, and maintenance burden. OK.
- **Acceptance criteria** are checkable but one is vague: "No false positives on common words containing prohibited substrings" — no verification method specified.
- **Implementation notes** are explicit behavioral rules. OK.

## Axis B — DNA alignment

- **DNA-54 (Forge bindings contract)** — the RFC claims to extend it. DNA-54 says "Canonical forge skill bodies must not contain hardcoded project-specific literals (commands, paths, terminology) in instruction lines." SKILL-17 extends this with a prohibition on specific terms. The extension is plausible but the RFC does not explain how SKILL-17 relates to SKILL-11 — are they complementary or overlapping? SKILL-11 already checks for `pnpm exec site-kernel run` and `docs/architecture-dna.md`. SKILL-17 adds term-based checks. The RFC should clarify the boundary.
- **`satisfies: [DNA-54]`** is correct — the RFC extends the forge bindings contract.
- No conflict with other DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries** — the RFC touches `packages/forge/src/validation/skill-validate.ts` (actually at `packages/forge/src/validators/skill-validate.ts`). The path in the File system responsibilities table is wrong: `src/validation/skill-validate.ts` vs actual `src/validators/skill-validate.ts`. **Finding: incorrect path.**
- **Pipeline placement** — `forge.skill.validate` is already part of `forge.doctor` and the build pipeline. The RFC correctly notes this. OK.
- **AGENTS.md updates** — the RFC does not identify which `AGENTS.md` files need updates. `packages/forge/AGENTS.md` documents SKILL-11..16 and will need a SKILL-17 entry. **Finding: missing AGENTS.md update identification.**
- **Command lifecycle** — `commands.proposed/added/changed/removed` are all empty. This is correct — no new commands are proposed, only a new validation rule in an existing command. OK.

## Axis D — Forward-only compliance

- No backward compatibility layers proposed. OK.
- The cleanup is a one-shot operation in the implementation commit. OK.
- No flags or dual-paths. OK.

## Axis E — Agent-facing policy

- **Status gate** — the RFC is in `draft` status and does not contain self-authorizing language. OK.
- **Implementation notes** reference RFC-0224, RFC-0334. OK.
- **Anti-fabrication** — not applicable (no content authoring). OK.
- **Storage policy** — not applicable. OK.

## Axis F — Pragmatism

- **Fundamental scope problem** — the RFC proposes prohibiting "RFC" and "ADR" in forge skill files, but forge's entire purpose is RFC/ADR governance. Evidence:
  - `fo-idea-audit` — title "RFC Audit", description "Audit RFCs for ecosystem fit", 65 RFC references. The skill literally cannot function without referencing RFCs.
  - `fo-idea-create-rfc` — title "RFC Create", description "Create a full RFC draft", 29 RFC references.
  - `fo-idea-create-adr` — title "ADR Create", description "Create a lightweight Architectural Decision Record (ADR)", 33 ADR references.
  - `fo-idea-implement` — 58 RFC + 43 ADR references. Implements RFCs/ADRs.
  - `fo-idea-plan` — 61 RFC references. Plans RFC implementation.
  - `fo-idea-enhance` — 55 RFC references. Enhances RFCs.
  - `fo-idea` — 37 RFC + 28 ADR references. Classifies ideas as RFC or ADR.
  - `fo-idea-status` — 12 RFC + 9 ADR references. Shows RFC/ADR status.
  - `forge-bootstrap` — 9 RFC + 10 ADR references. Onboarding skill that introduces forge's purpose.

  The RFC's Context claims "Forge consumers do not have access to the RFC/ADR infrastructure" — this is **factually wrong**. Forge IS the RFC/ADR infrastructure. Consumers install `@warpgogol/forge` specifically for RFC/ADR governance. The `package.json` keywords include `rfc`, `adr`, `governance`.

  The Design section says "Replace 'RFC' references with 'design document' or 'proposal'" — but an RFC in forge is not a "design document". RFC has a specific lifecycle (`draft → accepted → implemented`), specific validation rules (`rfc.validate`), specific frontmatter, and specific DNA invariant relationships. Calling it a "design document" would be factually incorrect and destroy the semantic precision that makes forge useful.

  **Finding: the RFC/ADR prohibition is unimplementable as written and must be dropped.**

- **WGogol name prohibition is defensible** — 14 matches across 7 files. `fo-review` says "WGogol standards" in its description and triggers. Replacing "WGogol" with "Forge" or "project" is reasonable since forge is autonomous. This part of the RFC should be retained.

- **Scope ambiguity** — the RFC says the prohibition applies to "instruction text, descriptions, and examples" but NOT to "YAML frontmatter metadata fields". The `description` field IS in frontmatter but is also user-visible text. The `triggers` field contains "RFC" (e.g., "audit this RFC"). The RFC is contradictory about whether frontmatter `description` and `triggers` are included or excluded.

- **Skill names** — `fo-idea-create-rfc` and `fo-idea-create-adr` have "rfc"/"adr" in their names. The RFC doesn't address whether skill names are covered. If they are, the skills must be renamed, which is a major breaking change not captured in `versionBump: patch`.

- **Shared and knowledge files** — `fo-pipeline-conventions.md` (8 RFC + 2 ADR references), `fo-session-save/learned-principles.md` (1 RFC), `fo-session-save/fix-patterns.md` (4 RFC). The RFC doesn't address whether `_shared/` files and knowledge files are covered by `skills/**/*.md`.

## Axis G — Blind spots

- **False positive rate** — the RFC mentions word-boundary matching but doesn't specify the exact regex. "ADR" as a word-boundary match could hit "ADR" in URLs, file paths, or code examples that are legitimately needed.
- **Cleanup scope** — 470 + 175 + 14 = 659 total matches. The RFC says "clean one file at a time, verify with `forge.skill.validate` after each" but doesn't estimate the effort or risk of introducing semantic errors during cleanup.
- **Skill functionality after cleanup** — the RFC doesn't consider what happens when you remove "RFC" from a skill called "RFC Audit". The skill becomes meaningless. This is a blind spot that should have been caught during idea creation.
- **`forge.yaml` binding keys** — `validateRfc` and `validateAdr` contain "Rfc"/"Adr". The RFC says these are excluded because they're "not user-visible", but they ARE visible in `forge.yaml` and in `ref()` calls in skill files. The distinction is unclear.

## Questions for the author

1. **How can a skill called "RFC Audit" (`fo-idea-audit`) function without referencing "RFC"?** This skill's title, description, triggers, and 65 instruction references all use "RFC" because the skill audits RFCs. Replacing "RFC" with "design document" would make the skill factually wrong — it doesn't audit design documents, it audits RFCs with specific lifecycle, validation, and DNA invariant relationships.

2. **Is the premise of the RFC correct?** The Context says "Forge consumers do not have access to the RFC/ADR infrastructure" but `package.json` says forge IS "RFC/ADR governance, skills, and project bootstrapping". Consumers install forge specifically for RFC/ADR governance. Why would they not know about RFCs/ADRs?

3. **Should the scope be narrowed to only the "WGogol" name prohibition?** The 14 "WGogol"/"WebGogol"/"WarpGogol" matches are genuine internal platform references that external consumers shouldn't see. The RFC/ADR terms are forge's core domain vocabulary. Would a narrowed RFC that only prohibits platform name references be more appropriate?
