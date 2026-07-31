---
id: RFC-0524
title: Cumulative knowledge system for forge skills
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- DNA-54
- RFC-0374
- RFC-0393
- RFC-0523
satisfies:
- DNA-54
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
  - forge.skill.validate
  - forge.doctor
  removed:
  - forge.init
appsImpacted: []
packagesImpacted:
- packages/forge
successSignals: []
nonGoals: []

---

# RFC-0524: Cumulative knowledge system for forge skills

## Context

Forge skills (RFC-0374) are operational workflow artifacts that guide agents through repetitive tasks. In practice, skills ask operators the same types of questions across sessions and make the same types of decisions. The `fo-site-scan` skill (created July 2026) introduced an ad-hoc three-layer knowledge system (L0 qa-log, L1 fix-patterns, L2 learned-principles) that allows the skill to learn from operator decisions and progressively automate previously-asked questions.

This pattern proved valuable but is currently isolated to `fo-site-scan`. Other interactive skills — particularly `grilling`, which is a dependency for 8+ skills — would benefit from the same cumulative learning capability. `grilling` asks operators 10-20 questions per session; these answers contain reusable knowledge about operator preferences that could improve recommended answers in future sessions.

There is currently no convention for how skills accumulate knowledge, where knowledge files live, how they are synced, or how trust in learned principles grows over time. Each skill would have to reinvent the pattern independently.

## Problem

1. **No reusable knowledge pattern.** `fo-site-scan` implemented a three-layer knowledge system ad-hoc. Other skills (`grilling`, `fo-fix`, `fo-review`) cannot adopt it without a documented convention because the pattern is embedded in `fo-site-scan`'s SKILL.md and auxiliary files.

2. **Skills ask repetitive questions.** `grilling` asks operators the same design questions across sessions. Without cumulative knowledge, each session starts from zero — the operator re-answers questions they already answered in previous sessions.

3. **No trust progression.** Even when a skill remembers past answers, there is no mechanism to distinguish "asked once" from "confirmed three times". A principle confirmed once may be wrong; a principle confirmed three times is likely stable. Without a confidence counter, skills cannot progressively automate decisions.

4. **No sync contract for knowledge files.** Skills live in `packages/forge/skills/` (source) and are synced to `.agents/skills/` (runtime copy). Knowledge files that are mutated during a run need a defined sync path back to source.

## Decision

A cumulative knowledge convention is established in `writing-great-skills.md` (shared skill reference). Skills opt in by declaring a `knowledge: string[]` array in SKILL.md frontmatter listing knowledge file names. `ForgeSkillEntry` gains an optional `knowledge?: string[]` field. `forge.skill.validate` enforces SKILL-13: declared knowledge files must exist. `forge.init` syncs declared knowledge files from `packages/forge/skills/` to `.agents/skills/`. `forge.doctor` reports stale knowledge files.

The convention defines a three-layer reference pattern (L0 qa-log, L1 fix-patterns, L2 learned-principles) that skills adopt adaptively — using 0, 1, 2, or 3 files as needed. L2 entries carry a `confirmations: N` counter; when confirmations reach threshold 3, the skill may apply the principle autonomously without asking the operator. Rejecting a recommended answer resets confirmations to 0.

## Architectural fit

- **DNA-54 (Forge bindings contract):** DNA-54 mandates that canonical forge skill bodies must not contain hardcoded project-specific literals, enforced by `forge.skill.validate`. This RFC extends the validation surface of `forge.skill.validate` with SKILL-13 (knowledge file existence), strengthening the forge skill contract that DNA-54 governs. The `knowledge:` field declares file names (not paths), preserving portability.
- **RFC-0374 (forge skill ecosystem):** This RFC extends the `ForgeSkillEntry` interface established by RFC-0374 with an optional `knowledge` field. No breaking change — existing skills without `knowledge:` continue to work.
- **RFC-0393 (forge bindings contract):** Knowledge files are skill-local artifacts, not project-specific literals. The `knowledge:` field declares file names (not paths), keeping skills portable.
- **RFC-0523 (granular skill concerns taxonomy):** This RFC depends on RFC-0523 for the four-level `concerns` enum used in the TypeScript contract and the `skill-create` prompt condition. RFC-0523 introduces SKILL-12 (concerns enum validation); this RFC introduces SKILL-13 (knowledge file existence). SKILL-13 numbering assumes SKILL-12 is already implemented. If RFC-0523 is not accepted, the `concerns` values in the TypeScript contract and `skill-create` condition fall back to the current binary enum (`document-only | implementation`).
- **Site OS operator model:** `forge.skill.validate` (workspace scope) gains SKILL-13. `forge.init` gains knowledge file sync. `forge.doctor` gains stale knowledge file detection. No new commands.

## Design

### Knowledge layer reference pattern

The convention in `writing-great-skills.md` describes a three-layer reference pattern. Skills adopt 0, 1, 2, or 3 layers as needed.

| Layer | File name | Role | Required fields |
| --- | --- | --- | --- |
| L0 | `qa-log.md` | Append-only raw Q&A log. Every question asked + answer given during a run. | date, question, answer (optional: skill-specific fields) |
| L1 | `fix-patterns.md` | Baseline fix patterns. Trusted by design, written by AI per operator direction. No confirmations counter. | Title, Condition, Action (optional: Pattern, Example) |
| L2 | `learned-principles.md` | Distilled principles from meta-analysis. Grows after each run with operator approval. | Title, Condition, Action, Added, Confirmations (optional: skill-specific fields) |

### Confidence progression

L2 entries carry a `confirmations: N` counter:

- **New principle** (meta-analysis): `confirmations: 1`
- **Operator confirms recommended answer**: `confirmations++` (autonomous increment by skill)
- **Operator rejects recommended answer**: `confirmations` reset to 0
- **`confirmations >= 3`**: skill applies principle autonomously, no question asked

Threshold is fixed at 3 for all skills and all principles. L1 entries do not have `confirmations` — they are trusted by design.

### Frontmatter

```yaml
# Skill with knowledge system
name: fo-site-scan
knowledge:
  - qa-log.md
  - fix-patterns.md
  - learned-principles.md

# Skill without knowledge system
name: fo-idea-status
# no knowledge: field
```

### CLI surface

No new commands. Existing commands gain knowledge-file awareness:

```sh
# SKILL-13: validates declared knowledge files exist
pnpm exec site-kernel run forge.skill.validate --all

# Syncs knowledge files from packages/forge/skills/ to .agents/skills/
pnpm exec site-kernel run forge.init

# Reports stale knowledge files (source vs .agents/ copy drift)
pnpm exec site-kernel run forge.doctor
```

### TypeScript contracts

```ts
export interface ForgeSkillEntry {
  name: string;
  category: "fo" | "shared" | "meta";
  invocation: "user" | "model";
  // After RFC-0523 is implemented:
  //   concerns: "read-only" | "document-only" | "content-mutation" | "code-mutation";
  // Before RFC-0523 (current state):
  concerns: "document-only" | "implementation";
  dependsOn: string[];
  path: string;
  knowledge?: string[]; // file names relative to SKILL.md directory
}
```

The `knowledge` field is additive and independent of the `concerns` enum change. If RFC-0523 is implemented first, the `concerns` type is the four-level enum; otherwise, it stays the current binary enum. The `knowledge` field works with either.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/<category>/<name>/` | Source-of-truth for SKILL.md + knowledge files |
| `.agents/skills/<name>/` | Synced runtime copy (read-only for knowledge files) |
| `packages/forge/src/registry.ts` | `ForgeSkillEntry.knowledge` field |
| `packages/forge/src/validators/skill-validator.ts` | SKILL-13 validation rule |
| `packages/forge/skills/shared/writing-great-skills/SKILL.md` | Convention documentation |

### Mutation contract

- **Source-of-truth**: `packages/forge/skills/<category>/<name>/`. Skills mutate knowledge files here during runs and commit to main repo. Skills always read from source, not from `.agents/`.
- **Runtime copy**: `.agents/skills/<name>/`. Synced by `forge.init`. Read-only — skills never write here. The `.agents/` copy exists for consumers who install `@wgogol/forge` as an npm package (where `packages/forge/skills/` is not directly accessible). In WGogol's monorepo, skills read from source directly.
- **Sync**: `forge.init` copies files listed in `knowledge:` frontmatter from source to `.agents/skills/`. This is a one-way sync (source → `.agents/`), never the reverse.
- **Stale detection**: `forge.doctor` compares source and `.agents/` copies, reports drift as warnings.

### Output format

`forge.skill.validate --json` with a SKILL-13 violation:

```json
{
  "command": "forge.skill.validate",
  "status": "fail",
  "violations": [
    {
      "skill": "fo-site-scan",
      "rule": "SKILL-13",
      "message": "Declared knowledge file 'qa-log.md' not found relative to SKILL.md directory"
    }
  ]
}
```

`forge.doctor --json` with a stale knowledge file warning:

```json
{
  "command": "forge.doctor",
  "status": "pass",
  "warnings": [
    {
      "type": "stale-knowledge-file",
      "skill": "fo-site-scan",
      "file": "learned-principles.md",
      "message": "Source and .agents/ copy differ — run forge.init to sync"
    }
  ]
}
```

### Failure modes

- `forge.skill.validate` exits non-zero if a declared `knowledge:` file does not exist (SKILL-13).
- `forge.doctor` reports stale knowledge files as warnings (not errors). The check integrates with the existing doctor command's bindings validation — knowledge file staleness is reported alongside binding drift.
- Skills without `knowledge:` field are unaffected — no validation, no sync, no stale check.
- `forge.doctor` does not report knowledge files that exist in source but are missing from `.agents/` if `forge.init` has never been run — this is expected on first install. Only files that exist in both locations but differ are reported as stale.

## Rollout

- **Convention documentation.** Add a "Cumulative knowledge pattern" section to `packages/forge/skills/shared/writing-great-skills/SKILL.md` describing the three-layer reference pattern, `knowledge:` frontmatter, confidence progression, and mutation contract.

- **`ForgeSkillEntry` update.** Add `knowledge?: string[]` to the interface in `packages/forge/src/registry.ts`.

- **SKILL-13 validation.** Add a validation rule to `forge.skill.validate` that checks each `knowledge:` file exists relative to the SKILL.md directory.

- **`forge.init` sync.** Extend `forge.init` to copy declared `knowledge:` files from `packages/forge/skills/` to `.agents/skills/`.

- **`forge.doctor` stale check.** Extend `forge.doctor` to compare source and `.agents/` knowledge files and report drift.

- **`skill-create` prompt.** When `skill-create` determines the new skill has `concerns: content-mutation | code-mutation` (after RFC-0523) or `concerns: implementation` (before RFC-0523) AND `invocation: user`, it asks the operator whether to adopt the cumulative knowledge pattern, with a concise explanation of why it may benefit this specific skill. If yes, `skill-create` creates empty knowledge files with header comments and adds `knowledge:` to frontmatter.

- **`fo-site-scan` retroactive adoption.** Add `knowledge: [qa-log.md, fix-patterns.md, learned-principles.md]` to `fo-site-scan` SKILL.md frontmatter. Files already exist.

- **`grilling` adoption.** Create `qa-log.md` and `learned-principles.md` in `packages/forge/skills/shared/grilling/`. Add `knowledge: [qa-log.md, learned-principles.md]` to `grilling` SKILL.md frontmatter. Update `grilling` SKILL.md body to read L2 at start of each session, use principles to improve recommended answers, and perform meta-analysis at end.

- **Other skills.** `fo-fix`, `fo-review`, and others may adopt the pattern later at their own pace. This RFC does not force adoption.

## Alternatives considered

- **Enforced contract (forge.skill.validate requires knowledge files).** Rejected because not every skill needs cumulative knowledge. `fo-idea-status` (read-only) and `fo-idea-create-rfc` (document-only) would need empty files just to pass validation. Convention with opt-in is cleaner.

- **Fixed three-layer structure for all skills.** Rejected because skills have different characteristics. `grilling` does not need L1 (no fix patterns). `fo-site-scan` needs all three. Fully adaptive `knowledge:` array lets each skill choose.

- **Separate `confidence.md` file (L3).** Rejected because `confirmations` is a single integer per principle — storing it inline in L2 is simpler and avoids a fourth file. No need for a separate confidence layer.

- **Derived confidence from L0 (count matching answers in qa-log).** Rejected because parsing L0 to compute confidence on every run is expensive and fragile. An explicit counter in L2 is deterministic and cheap.

- **Per-skill or per-principle confidence threshold.** Rejected because threshold is an implementation detail, not a design decision. Fixed threshold 3 is simple and reasonable. Changing it requires an RFC.

## Risks

- **Stale `.agents/` copies.** If a skill mutates knowledge files in `packages/forge/skills/` but `forge.init` is not run, `.agents/skills/` copies are stale. Mitigation: skills read from source (`packages/forge/skills/`), not from `.agents/`. `forge.doctor` detects drift. The `.agents/` copy is only used by external consumers who install `@wgogol/forge` as an npm package.

- **Knowledge file growth.** L0 (`qa-log.md`) is append-only and grows indefinitely. After 200 runs, it could contain 400+ entries. Mitigation: markdown text is small (~1-2 KB per entry). 400 entries = ~600 KB. Acceptable for git. If growth becomes a concern, operator can manually archive old entries.

- **npm publishing portability.** `@wgogol/forge` is published to npm with `"files": ["skills/"]` in `package.json`. Knowledge files in `packages/forge/skills/` would be included in the published package. WGogol's accumulated Q&A (L0) and learned principles (L2) are project-specific and should not leak to npm consumers. Mitigation: knowledge files ship as empty templates (header comments only). A `.npmignore` pattern excludes accumulated knowledge file content from the published package while keeping the template structure. `forge.init` syncs the empty templates to `.agents/skills/` for consumers; each project accumulates its own knowledge locally. The existing `fo-site-scan` knowledge files already follow this pattern — they contain only header comments and format documentation.

- **Concurrent execution.** Two agents running the same skill simultaneously could both append to L0 and clobber each other's entries. Mitigation: knowledge file writes are not atomic. If concurrent execution becomes a concern, a file-level lock or merge-on-conflict strategy can be introduced. For now, the convention assumes single-agent execution per skill.

- **False confidence.** A principle confirmed 3 times might still be wrong in a new context. Threshold 3 is a heuristic, not a proof. Mitigation: operator can always reject a recommended answer, resetting confirmations to 0. The skill re-asks from scratch.

- **Agent misinterpretation.** Agents might treat `confirmations >= 3` as "never ask again". But the convention says "may apply autonomously" — the skill should still re-evaluate if context changes. Mitigation: Implementation notes explicitly state that autonomous application is context-dependent, not absolute.

- **Convention adoption rate.** Skills adopt the pattern at their own pace. Some skills may never adopt. This is acceptable — the convention is opt-in, not enforced.

## Acceptance criteria

- [x] `ForgeSkillEntry.knowledge?: string[]` field added to `packages/forge/src/registry.ts` (evidence: packages/forge/src/registry.ts:28, `knowledge?: string[]` in ForgeSkillEntry interface)
- [x] `forge.skill.validate` enforces SKILL-13: declared `knowledge:` files must exist relative to SKILL.md directory (evidence: packages/forge/src/validators/skill-validate.ts:167-179, SKILL-13 check block; `forge.skill.validate --all` passes with zero violations)
- [x] `forge.init` syncs declared `knowledge:` files from `packages/forge/skills/` to `.agents/skills/` (evidence: packages/forge/src/onboarding/init.ts:142-166, knowledge file sync loop)
- [x] `forge.doctor` reports stale knowledge files (source vs `.agents/` drift) (evidence: packages/forge/src/onboarding/doctor.ts:164-211, `checkStaleKnowledgeFiles` function)
- [x] `writing-great-skills.md` contains a "Cumulative knowledge pattern" section describing L0/L1/L2, `knowledge:` frontmatter, confidence progression, and mutation contract (evidence: packages/forge/skills/shared/writing-great-skills/SKILL.md:91-132, "Cumulative knowledge pattern" section)
- [x] `fo-site-scan` SKILL.md frontmatter includes `knowledge: [qa-log.md, fix-patterns.md, learned-principles.md]` (evidence: packages/forge/skills/fo/fo-site-scan/SKILL.md:9-12, knowledge frontmatter field)
- [x] `grilling` SKILL.md frontmatter includes `knowledge: [qa-log.md, learned-principles.md]` and SKILL.md body updated to use knowledge system (evidence: packages/forge/skills/shared/grilling/SKILL.md:9-11, knowledge frontmatter; SKILL.md:16,28, L2 read and meta-analysis instructions)
- [x] `grilling` has `qa-log.md` and `learned-principles.md` files in `packages/forge/skills/shared/grilling/` (evidence: packages/forge/skills/shared/grilling/qa-log.md, packages/forge/skills/shared/grilling/learned-principles.md)
- [x] `skill-create` SKILL.md updated to prompt for knowledge system adoption when `concerns: content-mutation | code-mutation` AND `invocation: user` (evidence: packages/forge/skills/meta/skill-create/SKILL.md:30-32, "Cumulative knowledge prompt" step 1.5)
- [x] `forge.skill.validate --all` passes with zero violations after adoption (evidence: `pnpm exec site-kernel run forge.skill.validate --json` output: status: pass, violations: [])
- [x] `rfc.validate` passes on this RFC file (evidence: `pnpm exec site-kernel run rfc.validate RFC-0524 --json` output: status: pass, count: 1, violations: [])

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- **Knowledge files are mutated in `packages/forge/skills/<category>/<name>/`** (source-of-truth), never in `.agents/skills/` (synced read-only copy).
- **`confirmations` is incremented autonomously by the skill** after operator confirms a recommended answer. No double-confirmation.
- **`confirmations` is reset to 0** when operator rejects a recommended answer. The principle stays in L2 but trust is withdrawn.
- **Autonomous application (`confirmations >= 3`) is context-dependent**, not absolute. If the skill detects a changed context (different site, different violation type), it should re-ask even if a principle has high confidence.
- **L0 (`qa-log.md`) is append-only.** Never delete or rewrite entries. Only append.
- **L1 (`fix-patterns.md`) does not have `confirmations`.** L1 is trusted by design — written by AI per operator direction.
- When creating a new skill via `skill-create`, the agent MUST assess whether the cumulative knowledge pattern benefits the skill. If `concerns: content-mutation | code-mutation` AND `invocation: user`, ask the operator with a concise explanation. Otherwise, do not ask.
- Agents MUST NOT weaken or remove the SKILL-13 validation rule without a new RFC that supersedes this one.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
