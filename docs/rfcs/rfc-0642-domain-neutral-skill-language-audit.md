---
id: RFC-0642
title: "Domain-Neutral Skill Language Audit"
status: accepted
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
createdAt: 2026-08-01
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0393
  - RFC-0523
  - RFC-0638
  - RFC-0639
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
successSignals:
  - All 26 fo-* skill files audited for domain-specific language
  - Skills that reference software-specific binding keys (typecheck, scopedBuild, test) in instruction lines use semantic binding keys (validate, produce, verify) instead
  - "`forge.skill.validate` enforces SKILL-18: skill instruction lines must not reference software-specific binding keys"
  - Skills work correctly in both software and video domain projects
  - "Prose terminology migration uses `ref(bindings.terminology.artifact)` where applicable (blocked on RFC-0639 `resolveTerminology()` implementation)"
nonGoals:
  - Do not define the profile schema in this RFC — that is RFC-0638
  - Do not define the bindings schema in this RFC — that is RFC-0639
  - Do not change forge.create or forge.doctor behavior in this RFC — that is RFC-0640
  - Do not add Editframe-specific profiles in this RFC — that is RFC-0641
  - Do not create new skills — this RFC audits and migrates existing skill language only
  - Do not implement `resolveTerminology()` — that is RFC-0639. This RFC consumes it.
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

# RFC-0642: Domain-Neutral Skill Language Audit

## Context

Forge ships 33 skills (`fo-*` prefix) that are designed to be domain-neutral and portable. SKILL-11 (RFC-0393) already enforces that skill bodies must not contain hardcoded `pnpm exec site-kernel run` or `docs/architecture-dna.md` in instruction lines. SKILL-17 (RFC-0539) enforces that skill files must not contain specific platform RFC/ADR ids or platform names.

However, skills still contain software-domain-specific language in instruction lines: references to "typecheck", "build", "test", "package", "app", "service" — terms that are meaningless in a video, book, or music project. The semantic binding keys from RFC-0639 (`validate`, `produce`, `verify`, `preview`, `lint`) and the terminology resolution chain (bindings → profile → default) exist, but skills have not been audited to use them.

## Problem

Fo-* skills contain hardcoded software-domain terms in instruction lines. Examples:

- Skills that reference `ref(bindings.commands.typecheck)` instead of the semantic `ref(bindings.commands.validate)`.
- Skills that reference `ref(bindings.commands.scopedBuild)` instead of `ref(bindings.commands.produce)`.
- Skills that reference `ref(bindings.commands.test)` instead of `ref(bindings.commands.verify)`.
- Skills that use "app", "service", "package" in prose instead of the terminology-resolved `ref(bindings.terminology.artifact)`.

There is no validation rule preventing this. SKILL-11 catches hardcoded commands but not domain-specific binding key references. SKILL-17 catches platform names but not domain-specific terms.

A skill that says `Run ref(bindings.commands.typecheck) to verify types` works in a software project but produces a null binding (degraded step) in a video project — the video project has no `typecheck` binding. The skill should say `Run ref(bindings.commands.validate) to verify the artifact` — then it works in both domains.

## Decision

Two changes are made:

1. **SKILL-18 validation rule**: `forge.skill.validate` enforces a new rule SKILL-18: canonical forge skill bodies (`packages/forge/skills/fo/**/*.md`) must not reference software-specific binding keys (`bindings.commands.typecheck`, `bindings.commands.scopedBuild`, `bindings.commands.test`) in instruction lines (code blocks and `run:` directives — same scope as SKILL-11). Skills must reference semantic keys (`bindings.commands.validate`, `bindings.commands.produce`, `bindings.commands.verify`) instead. The check uses `extractInstructionLines` (same as SKILL-11): it scans lines inside fenced code blocks and `run:` directive lines. Software-specific keys remain valid in `forge.yaml` itself and in narrative prose outside code blocks.

2. **Skill language migration**: All 26 fo-* skills are audited and migrated:
   - `ref(bindings.commands.typecheck)` → `ref(bindings.commands.validate)` in instruction lines (code blocks and `run:` directives)
   - `ref(bindings.commands.scopedBuild)` → `ref(bindings.commands.produce)` in instruction lines
   - `ref(bindings.commands.test)` → `ref(bindings.commands.verify)` in instruction lines
   - Hardcoded "app", "service", "package" in narrative prose → `ref(bindings.terminology.artifact)` or domain-neutral phrasing (blocked on RFC-0639 `resolveTerminology()` implementation)
   - Skills that are inherently software-specific (e.g. `fo-add-tests`) use the `<!-- skill-lint-disable SKILL-18 -->` escape hatch with a documentation comment explaining why the skill is software-domain-specific.

The `<!-- skill-lint-disable SKILL-18 -->` escape hatch is available, same as SKILL-11 and SKILL-17. No hardcoded exempt set is maintained — the escape hatch is the sole exemption mechanism, keeping the validator decoupled from specific skill names.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: SKILL-18 extends the de-hardcoding principle from project-specific values (SKILL-11) and platform-specific values (SKILL-17) to domain-specific values. The three rules form a complete de-hardcoding lattice: SKILL-11 (no hardcoded commands), SKILL-17 (no platform names), SKILL-18 (no domain-specific binding keys).
- **RFC-0393 (Bindings contract)**: Skills reference semantic keys from RFC-0639 instead of software-specific keys. The degradation contract applies: if a semantic key is null, the skill degrades gracefully.
- **RFC-0523 (Skill concerns taxonomy)**: SKILL-18 applies to all concern levels — `read-only`, `document-only`, `content-mutation`, `code-mutation`.
- **RFC-0639 (Semantic bindings)**: This RFC consumes the semantic keys (`validate`, `produce`, `verify`) and `resolveTerminology()` defined by RFC-0639. Implementation of RFC-0642 is blocked until RFC-0639 is implemented — without semantic keys in the bindings schema, `ref(bindings.commands.validate)` resolves to `null`.
- **Skill packs (RFC-0539)**: SKILL-18 applies to forge skills only (`fo-*` prefix). Pack skills are validated with SKILL-01..17 but not SKILL-18 — pack skills are domain-specific by design. SKILL-18 is added to the forge-skill validation path only (after SKILL-11, before SKILL-13), not to the pack-skill validation path.

## Design

### CLI surface

```sh
# Validate skills including SKILL-18
forge skill.validate --json
```

`forge.skill.list` output is unchanged — SKILL-18 violations appear in `forge.skill.validate` output only.

### TypeScript contracts

```ts
// SKILL-18: domain-specific binding key prohibition
// Checks instruction lines (code blocks and run: directives — same scope as SKILL-11)
// for references to software-specific binding keys.
// Uses extractInstructionLines() from the existing validator.

const SKILL18_PATTERNS: RegExp[] = [
  /bindings\.commands\.typecheck/gi,
  /bindings\.commands\.scopedBuild/gi,
  /bindings\.commands\.test/gi,
];

const SEMANTIC_REPLACEMENTS: Record<string, string> = {
  "bindings.commands.typecheck": "bindings.commands.validate",
  "bindings.commands.scopedBuild": "bindings.commands.produce",
  "bindings.commands.test": "bindings.commands.verify",
};

// No hardcoded exempt set — the <!-- skill-lint-disable SKILL-18 -->
// escape hatch is the sole exemption mechanism.
// Skills that are inherently software-specific (e.g. fo-add-tests)
// add the escape hatch with a documentation comment.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/fo/*/SKILL.md` | All 26 fo-* skill files audited and migrated |
| `packages/forge/src/validators/skill-validate.ts` | SKILL-18 rule added to validator (forge-skill path only) |
| `packages/forge/src/tests/skill-validate.test.ts` | Tests for SKILL-18 (pass, fail, escape hatch) |
| `.agents/skills/fo/*/SKILL.md` | Synced copies updated |

### Output format

```json
{
  "command": "forge.skill.validate",
  "status": "fail",
  "violations": [
    {
      "skill": "fo-review",
      "rule": "SKILL-18",
      "message": "Instruction line references 'bindings.commands.typecheck' — use 'bindings.commands.validate' instead",
      "line": 42
    }
  ]
}
```

### Failure modes

- **SKILL-18 violation**: `forge.skill.validate` exits non-zero with per-skill error details. The `<!-- skill-lint-disable SKILL-18 -->` escape hatch suppresses the check for a specific skill.
- **Escape hatch usage**: Skills that are inherently software-specific (e.g. `fo-add-tests`) add `<!-- skill-lint-disable SKILL-18 -->` with a documentation comment explaining why the skill is software-domain-specific. No hardcoded exempt set is maintained.
- **Narrative prose**: SKILL-18 does not check narrative prose (lines outside code blocks and `run:` directives). Software-specific terms in prose are migrated to `ref(bindings.terminology.artifact)` or domain-neutral phrasing as part of the prose migration, but this is not enforced by SKILL-18.
- **Semantic binding is null**: When a skill references `ref(bindings.commands.validate)` and the binding is `null` (not configured in forge.yaml), the degradation contract applies: required → skill refuses to start; optional → step skipped with `Degraded:` line in report.

## Rollout

- **SKILL-18 enforcement**: The new validation rule is added to `forge.skill.validate` (forge-skill validation path only, not pack-skill path). Existing skills that violate SKILL-18 are migrated in the same implementation. After migration, `forge.skill.validate` passes.
- **Dependency on RFC-0639**: Implementation of the binding-key migration (`typecheck` → `validate`) and prose migration (`app` → `ref(bindings.terminology.artifact)`) is blocked until RFC-0639 is implemented. RFC-0639 adds semantic keys to the bindings schema and exports `resolveTerminology()`. Without RFC-0639, `ref(bindings.commands.validate)` resolves to `null` and `ref(bindings.terminology.artifact)` is not resolvable.
- **Grace period**: None needed — all skills are migrated before the rule is enforced. If a skill is missed, the escape hatch (`<!-- skill-lint-disable SKILL-18 -->`) provides a temporary workaround.
- **Skill packs**: Pack skills are not affected by SKILL-18. They are domain-specific by design and use their own terminology.
- **Synced copies**: `.agents/skills/` copies are updated in the same commit as `packages/forge/skills/` changes.

## Alternatives considered

- **Remove software-specific keys entirely**: Rejected. Software projects still use `typecheck`, `test`, `scopedBuild`. Removing them would break existing forge.yaml files.
- **Per-skill domain declaration**: Rejected. Skills should be domain-neutral by default. Domain-specific skills belong in skill packs (RFC-0539), not in forge core.
- **Automatic terminology substitution in skill bodies**: Rejected. Skill bodies are markdown files read by AI agents. Automatic substitution at read time would be fragile and non-deterministic. Skills should reference binding keys directly.

## Risks

- **Skill behavior change**: Migrating from `typecheck` to `validate` changes which binding key is resolved. In software projects, `validate` might be null while `typecheck` is set. Mitigation: `forge.create` (RFC-0640) writes both keys for software profiles. Existing forge.yaml files may need to add semantic keys — `forge doctor` reports this as a `defaultable-binding-null` notice. When `validate` is null, the degradation contract applies (optional → step skipped with `Degraded:` line).
- **False positives**: SKILL-18 flags `ref(bindings.commands.typecheck)` in code blocks, not the bare word "typecheck" or "test" in prose. The regex matches `bindings.commands.typecheck` specifically. Narrative prose is not checked by SKILL-18.

## Acceptance criteria

- [ ] SKILL-18 rule implemented in `forge.skill.validate` (forge-skill validation path only)
- [ ] SKILL-18 checks instruction lines (code blocks and `run:` directives) for `bindings.commands.typecheck`, `bindings.commands.scopedBuild`, `bindings.commands.test`
- [ ] `<!-- skill-lint-disable SKILL-18 -->` escape hatch works
- [ ] All 26 fo-* skills audited and migrated to semantic keys where applicable
- [ ] Software-specific skills use escape hatch with documentation comment (no hardcoded exempt set)
- [ ] `.agents/skills/` synced copies updated
- [ ] Unit tests for SKILL-18: pass case, fail case, escape hatch
- [ ] `packages/forge/AGENTS.md` updated with SKILL-18 documentation
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- **Implementation is blocked on RFC-0639.** The binding-key migration and prose migration both depend on RFC-0639's semantic keys and `resolveTerminology()`. Do not implement RFC-0642 until RFC-0639 is `implemented`.
- SKILL-18 is added to the forge-skill validation path only (after SKILL-11, before SKILL-13 in `packages/forge/src/validators/skill-validate.ts`). Do not add it to the pack-skill validation path.
- SKILL-18 uses `extractInstructionLines()` (same as SKILL-11) to scan code-block and `run:` directive lines. It does not scan narrative prose.
- No hardcoded exempt set. Software-specific skills use `<!-- skill-lint-disable SKILL-18 -->` with a documentation comment.

- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334). -->
