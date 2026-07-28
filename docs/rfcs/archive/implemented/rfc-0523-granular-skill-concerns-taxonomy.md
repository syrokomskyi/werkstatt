---
id: RFC-0523
title: "Granular skill concerns taxonomy"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0374
amendedBy: []
related:
  - DNA-54
  - RFC-0374
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - forge.skill.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals: []
nonGoals: []
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0523: Granular skill concerns taxonomy

## Context

The forge skill system (RFC-0374) introduced a `concerns` field in `ForgeSkillEntry` with two values: `document-only` and `implementation`. This binary taxonomy was designed to distinguish skills that only produce documents from skills that modify code.

In practice, the binary system does not reflect the actual range of skill behavior. Several skills declared `document-only` despite modifying code or content files (e.g. `fo-fix` is declared `document-only` but modifies source code and commits changes). The newly created `fo-site-scan` skill modifies content `.md` files and `.yaml` manifests but does not touch executable `.ts` code — a middle ground that neither binary value accurately captures.

The `concerns` field is a cross-workspace contract: it is read by `forge.skill.validate` (SKILL invariants), `forge.doctor` (skill health checks), and agents (to understand risk levels before invoking a skill). A more granular taxonomy would allow agents and operators to make better-informed decisions about when and how to invoke skills.

## Problem

The binary `concerns` field (`document-only` | `implementation`) in `ForgeSkillEntry` (`packages/forge/src/registry.ts:23`) is insufficient for three reasons:

1. **Misclassification is rampant.** `fo-fix` is declared `document-only` but modifies source code and commits. `fo-architecture` is declared `document-only` but generates HTML reports. The field does not reflect reality.

2. **No middle ground for content mutation.** Skills like `fo-site-scan` modify content `.md` files and `.yaml` manifests (which affect builds) but do not touch executable `.ts` code. Forcing these into `document-only` understates the risk; forcing them into `implementation` overstates it.

3. **Agents cannot distinguish risk levels.** When an agent or operator sees `concerns: implementation`, they cannot tell whether the skill modifies a single `.md` file or rewrites TypeScript packages. This makes it harder to decide when to invoke a skill autonomously vs. with operator supervision.

## Decision

The `concerns` field in `ForgeSkillEntry` is replaced with a four-level taxonomy: `read-only`, `document-only`, `content-mutation`, and `code-mutation`. `forge.skill.validate` enforces the closed set and rejects unknown values. All existing skills are reclassified to the most accurate new value.

## Architectural fit

- **DNA-54 (Forge bindings contract):** DNA-54 established `forge.skill.validate` as the enforcement mechanism for forge skill frontmatter invariants (SKILL-01 through SKILL-11). This RFC extends that same enforcement framework by adding SKILL-12 (concerns enum validation) and updating SKILL-10 (execution instruction check) to reflect the expanded taxonomy. The RFC does not change DNA-54's hardcoded-literals rule (SKILL-11); it extends the command that enforces it.
- **RFC-0374 (forge skill ecosystem):** This RFC amends the `ForgeSkillEntry` interface established by RFC-0374. The `concerns` field was introduced there as a binary enum; this RFC replaces it with a four-level enum.
- **Site OS operator model:** The `concerns` field is read by `forge.skill.validate` (workspace scope) and `forge.doctor`. No new commands are introduced; only the validation logic of an existing command changes.

## Design

### Taxonomy

| Value | Description | Examples |
| --- | --- | --- |
| `read-only` | Skill only reads files and produces output (chat messages, reports). Does not modify, create, or delete any file. Does not commit. | `fo-idea-status`, `grilling` |
| `document-only` | Skill modifies or creates `.md` files (RFCs, ADRs, documentation). Does not touch content files, manifests, or executable code. | `fo-idea-create-rfc`, `fo-doc-audit`, `fo-idea-create-adr` |
| `content-mutation` | Skill modifies content files (`.md` page content, `.yaml` manifests) and commits changes. Does not touch executable `.ts`/`.astro` code. | `fo-site-scan`, `fo-fix` |
| `code-mutation` | Skill modifies executable code (`.ts`, `.astro`, `.css`, etc.) and commits changes. | `fo-add-tests`, `fo-harvest`, `forge-bootstrap` |

### CLI surface

No new commands. The existing `forge.skill.validate` command gains a new validation rule:

```sh
pnpm exec site-kernel run forge.skill.validate --all
```

Exits non-zero if any skill has a `concerns` value outside the four-level enum.

Additionally, the existing SKILL-10 rule (code execution instructions in `document-only` skills) is updated: the check now covers both `read-only` and `document-only` skills, since neither category should contain code execution instructions. `content-mutation` and `code-mutation` skills may contain execution instructions.

### TypeScript contracts

```ts
export interface ForgeSkillEntry {
  name: string;
  category: "fo" | "shared" | "meta";
  invocation: "user" | "model";
  concerns: "read-only" | "document-only" | "content-mutation" | "code-mutation";
  dependsOn: string[];
  path: string;
}
```

The `concerns` union type changes from two values to four. `forge.skill.validate` checks SKILL-12: `concerns` must be one of the four allowed values.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/registry.ts` | `ForgeSkillEntry.concerns` type updated; all 30 skills reclassified |
| `packages/forge/src/skill-schema.ts` | Zod `concerns` enum updated from two values to four |
| `packages/forge/skills/**/*.md` | SKILL.md frontmatter `concerns` field updated for all skills |
| `.agents/skills/*/SKILL.md` | Synced from `packages/forge/skills/` by `forge.init` |
| `packages/forge/src/validators/skill-validate.ts` | SKILL-12 validation rule added; SKILL-10 updated for new taxonomy |
| `docs/verification-plan.xml` | SKILL-12 rule documented in the verification surface |

### Output format

```json
{
  "command": "forge.skill.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "SKILL-12",
      "severity": "error",
      "message": "concerns: "hybrid" is not a valid value. Allowed: read-only, document-only, content-mutation, code-mutation"
    }
  ]
}
```

### Failure modes

- `forge.skill.validate` exits non-zero on unknown `concerns` values (SKILL-12).
- `forge.skill.validate` exits non-zero if a `read-only` or `document-only` skill contains code execution instructions (updated SKILL-10).
- No grace period — all skills must be reclassified in the same commit that changes the type. This is safe because the skill set is small (30 skills) and all are under forge control.
- `forge.doctor` reports skills with mismatched `concerns` between registry and SKILL.md frontmatter.

## Rollout

- **Single-commit migration.** The type change, validator update, and all skill reclassifications happen in one commit. No grace period — the skill set is small and fully under forge control.
- **New skills** created after this RFC must use one of the four values. `forge.port.scaffold` defaults to `document-only` (the most common value).
- **`forge.init`** syncs the updated SKILL.md files from `packages/forge/skills/` to `.agents/skills/`.
- **`build.check`** already runs `forge.skill.validate` — no pipeline change needed.
- **Reclassification table** (existing skills):

| Skill | Old `concerns` | New `concerns` | Rationale |
| --- | --- | --- | --- |
| `fo-idea` | `document-only` | `document-only` | Produces RFC/ADR routing only |
| `fo-idea-create-rfc` | `document-only` | `document-only` | Creates RFC `.md` files |
| `fo-idea-create-adr` | `document-only` | `document-only` | Creates ADR `.md` files |
| `fo-idea-audit` | `document-only` | `read-only` | Reads RFCs, produces chat report |
| `fo-idea-enhance` | `document-only` | `document-only` | Modifies RFC `.md` files |
| `fo-idea-implement` | `document-only` | `code-mutation` | Modifies `.ts`/`.astro` code, runs typecheck, commits |
| `fo-idea-plan` | `document-only` | `document-only` | Creates plan `.md` files |
| `fo-idea-status` | `document-only` | `read-only` | Reads RFCs, produces chat table |
| `fo-idea-i-just-want-to-see-the-plan` | `document-only` | `document-only` | Delegates to other skills |
| `fo-idea-i-just-want-to-see-the-result` | `document-only` | `code-mutation` | Orchestrates full pipeline incl. code |
| `fo-extract-dna` | `document-only` | `document-only` | Produces DNA `.md` files |
| `fo-review` | `document-only` | `read-only` | Reads code, produces chat report |
| `fo-fix` | `document-only` | `code-mutation` | Applies review findings to `.ts` code, runs typecheck, commits |
| `fo-doc-audit` | `document-only` | `document-only` | Modifies `.md` documentation files |
| `fo-add-tests` | `implementation` | `code-mutation` | Writes `.ts` test files |
| `fo-architecture` | `document-only` | `document-only` | Produces HTML report (document artifact) |
| `fo-handoff` | `document-only` | `document-only` | Produces handoff `.md` files |
| `fo-triage` | `document-only` | `document-only` | Produces issue `.md` files |
| `fo-qa` | `document-only` | `document-only` | Produces issue `.md` files |
| `fo-harvest` | `implementation` | `code-mutation` | Ports code into `packages/forge` |
| `fo-spec-ingest` | `document-only` | `document-only` | Produces spec `.md`/`.yaml` files |
| `fo-session-retro` | `document-only` | `document-only` | Produces `.md` notes |
| `fo-site-scan` | `implementation` | `content-mutation` | Modifies content `.md` + manifest `.yaml` |
| `grilling` | `document-only` | `read-only` | Only asks questions, no file I/O |
| `writing-great-skills` | `document-only` | `read-only` | Reference document, no file I/O |
| `windows-ai-tooling` | `document-only` | `document-only` | Produces config `.md` files |
| `my-preferences` | `document-only` | `document-only` | Modifies `PREFERENCES.md` |
| `skill-create` | `document-only` | `document-only` | Creates SKILL.md files |
| `port-to-forge` | `document-only` | `code-mutation` | Scaffolds + implements forge code |
| `forge-bootstrap` | `implementation` | `code-mutation` | Scaffolds project code |

## Alternatives considered

- **Keep binary, fix misclassifications.** Reclassify `fo-fix` to `implementation` and leave the taxonomy at two values. Rejected because the binary system still cannot distinguish content mutation from code mutation — the distinction matters for agent autonomy decisions.

- **Freeform string field.** Allow any string in `concerns` and let each skill describe its behavior. Rejected because `forge.skill.validate` cannot enforce a closed set, and agents cannot programmatically compare risk levels across skills.

- **Add a separate `risk` field.** Keep `concerns` binary and add a `risk: low | medium | high` field. Rejected because `concerns` and `risk` would overlap (a `code-mutation` skill is inherently higher risk than a `read-only` skill). Combining them into one four-level enum is simpler and avoids redundant metadata.

## Risks

- **Misclassification of edge-case skills.** Some skills blur the line between `document-only` and `content-mutation` (e.g. `fo-architecture` produces an HTML report — is that a document or content?). Mitigation: the reclassification table in the Rollout section provides explicit assignments for all existing skills.

- **Agent misinterpretation.** Agents might interpret `content-mutation` as "safe to auto-run" and `code-mutation` as "needs supervision". This is a reasonable heuristic but not a hard rule — the `invocation` field (user vs. model) is the authoritative signal for auto-run eligibility. Mitigation: the Implementation notes section explicitly states that `concerns` is informational, not a gating mechanism.

- **Maintenance burden.** Four values require more thought than two when creating new skills. Mitigation: `forge.port.scaffold` defaults to `document-only`, and the `skill-create` skill will prompt for the correct value during skill creation.

- **RFC-0374 amendment.** This RFC amends the `ForgeSkillEntry` interface from RFC-0374. The `amends` field is set in frontmatter. No migration needed — the type change is breaking but safe because all consumers are in the same monorepo.

## Acceptance criteria

- [x] `ForgeSkillEntry.concerns` type in `packages/forge/src/registry.ts` is updated to the four-level union (`read-only | document-only | content-mutation | code-mutation`) (evidence: packages/forge/src/registry.ts:24, pnpm --filter @wgogol/forge build:check pass)
- [x] `skillFrontmatterSchema` in `packages/forge/src/skill-schema.ts` is updated to the four-level Zod enum (evidence: packages/forge/src/skill-schema.ts:22, pnpm --filter @wgogol/forge test pass)
- [x] `forge.skill.validate` enforces SKILL-12: rejects `concerns` values outside the four-level enum (evidence: packages/forge/src/validators/skill-validate.ts:88-100, SKILL-12 ruleId mapping for concerns path)
- [x] SKILL-10 is updated: `read-only` and `document-only` skills are blocked from containing code execution instructions (evidence: packages/forge/src/validators/skill-validate.ts:143, condition checks read-only || document-only)
- [x] All existing skills in `packages/forge/src/registry.ts` are reclassified per the Rollout table (evidence: packages/forge/src/registry.ts:29-273, 30 entries with four-level concerns)
- [x] All SKILL.md frontmatter files in `packages/forge/skills/` and `.agents/skills/` are synced with the new `concerns` values (evidence: 26 files changed in commit 5d8e3ccce)
- [x] `forge.skill.validate --all` passes with zero violations after reclassification (evidence: pnpm exec site-kernel run forge.skill.validate --all → 0 violations)
- [x] `packages/forge/AGENTS.md` documents the four-level taxonomy in the Skills section (evidence: packages/forge/AGENTS.md:31, four-level taxonomy documented with RFC-0523 reference)
- [x] `docs/verification-plan.xml` documents the SKILL-12 rule in the verification surface (evidence: docs/verification-plan.xml:409-412, vm-08 entry for forge skill validation changes)
- [x] `rfc.validate` passes on this RFC file (evidence: pnpm exec site-kernel run rfc.validate RFC-0523 --json → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The `concerns` field is **informational**, not a gating mechanism. The `invocation` field (`user` vs. `model`) is the authoritative signal for whether a skill may auto-run. `concerns` helps agents and operators understand the risk profile, but does not by itself prevent invocation.
- When creating a new skill via `skill-create`, the agent MUST classify the skill into one of the four `concerns` values based on the skill's actual behavior, not a default.
- Agents MUST NOT weaken or remove the SKILL-12 validation rule without a new RFC that supersedes this one.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
