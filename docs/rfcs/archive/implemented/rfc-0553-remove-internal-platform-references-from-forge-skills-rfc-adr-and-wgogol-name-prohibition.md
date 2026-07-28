---
id: RFC-0553
title: "Remove internal platform RFC/ADR references and WGogol name from Forge skills"
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
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0393
  - RFC-0524
  - RFC-0539
  - RFC-0542
  - RFC-0547
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
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "No Forge skill file in packages/forge/skills/ contains specific platform RFC/ADR ids (RFC-NNNN, ADR-NNNN) or the terms WGogol, WebGogol, WarpGogol"
  - "forge.skill.validate enforces SKILL-17: prohibition of internal platform RFC/ADR id references and platform name references"
  - "Existing skills are cleaned of all specific platform RFC/ADR id references and platform name references"
  - "Forge consumers do not see internal platform RFC/ADR ids or the WGogol platform name in skill instructions"
nonGoals:
  - "Removing generic 'RFC'/'ADR' terms from skill files — these are forge's domain vocabulary (forge IS an RFC/ADR governance framework)"
  - "Removing generic example ids like 'RFC-XXXX' or 'ADR-XXXX' (literal placeholder X's) — these are illustrative, not platform references"
  - "Removing RFC/ADR references from Forge source code (TypeScript) — only skill .md files are in scope"
  - "Removing @warpgogol/forge package name — the npm package name remains as-is"
  - "Removing forge.yaml or PREFERENCES.md references — these are configuration files, not skills"
  - "Renaming the forge.doctor or forge.skill.validate commands — these are CLI commands, not skill content"
  - "Removing file path references like 'adr-0000-template.md' — these are file names, not RFC/ADR id references"
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

# RFC-0553: Remove internal platform RFC/ADR references and WGogol name from Forge skills

## Context

Forge is published to npm as `@warpgogol/forge` and used by external consumers. Forge IS an RFC/ADR governance framework — its `package.json` description reads "Framework for documenting and implementing ideas — RFC/ADR governance, skills, and project bootstrapping" with keywords `["rfc", "adr", "governance"]`. The terms "RFC" and "ADR" are forge's domain vocabulary and must remain in skill files.

However, the Forge skill files (`packages/forge/skills/**/*.md`) currently contain two categories of internal platform references that external consumers should not see:

1. **Specific platform RFC/ADR ids** — skills reference specific RFCs and ADRs from this platform (e.g., "RFC-0353", "RFC-0524", "RFC-0548", "RFC-0367", "ADR-0003"). These are internal governance artifacts of this specific WGogol platform instance. External forge consumers have their own RFC/ADR registries and cannot resolve references to this platform's RFCs.

2. **WGogol/WebGogol/WarpGogol names** — skills contain references to the parent platform name in various forms. Forge is an autonomous product and should not expose its parent platform's name.

RFC-0393 established SKILL-11 (no hardcoded project literals like `pnpm exec site-kernel run` and `docs/architecture-dna.md`) and DNA-54 (Forge bindings contract). This RFC extends the skill validation rules with a new SKILL-17 prohibiting internal platform RFC/ADR id references and platform name references.

## Problem

Forge skills contain internal platform references that are meaningless to external consumers:

1. **Specific platform RFC/ADR id references** — `packages/forge/skills/**/*.md` files reference specific RFCs and ADRs from this platform (e.g., "RFC-0353" in `fo-pipeline-conventions.md`, "RFC-0524" in `writing-great-skills/SKILL.md`, "RFC-0548" in `forge-bootstrap/SKILL.md` and `fo-session-retro/SKILL.md`, "RFC-0367" in `fo-idea-create-adr/SKILL.md"). External consumers cannot resolve these references.

2. **Platform name references** — skills contain "WGogol", "WebGogol", "WarpGogol" in descriptions, triggers, and instruction text (14 matches across 7 files). Forge is autonomous and should not expose its parent platform.

There is no validation rule preventing these references from being introduced or persisting in skill files.

## Decision

A new validation rule SKILL-17 is added to `forge.skill.validate`: Forge skill files (`packages/forge/skills/**/*.md`) MUST NOT contain specific platform RFC/ADR ids (pattern `RFC-\d{4}` or `ADR-\d{4}`) or the platform names "WGogol", "WebGogol", "WarpGogol" in any case variation. Generic "RFC"/"ADR" terms and generic placeholder ids like "RFC-XXXX"/"ADR-XXXX" (literal X's) are allowed — they are forge's domain vocabulary. Existing skills are cleaned of all specific platform RFC/ADR id references and platform name references.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — extends skill validation with a new prohibition rule targeting internal platform references.
- **RFC-0393** (Forge bindings contract) — established SKILL-11..13; this RFC adds SKILL-17. SKILL-11 prohibits hardcoded project literals (`pnpm exec site-kernel run`, `docs/architecture-dna.md`); SKILL-17 prohibits specific platform RFC/ADR id references and platform name references. They are complementary: SKILL-11 catches hardcoded commands and paths, SKILL-17 catches hardcoded governance artifact references and platform names.
- **RFC-0524** (cumulative knowledge system) — skill knowledge files must also comply with SKILL-17.
- **RFC-0539** (portable skill registry) — synced skills must be clean of internal references.
- **RFC-0547** (barrier-free onboarding) — aligns with the principle that operators should not see internal jargon.

## Design

### SKILL-17: Internal platform RFC/ADR id and platform name prohibition

New validation rule added to `forge.skill.validate`:

> SKILL-17: Skill files (`packages/forge/skills/**/*.md`) MUST NOT contain:
>
> 1. **Specific platform RFC/ADR ids** — any text matching `\bRFC-\d{4}\b` or `\bADR-\d{4}\b` (word-boundary match, case-sensitive). This catches references to specific RFCs and ADRs from this platform (e.g., "RFC-0353", "ADR-0003").
> 2. **Platform names** — "WGogol", "WebGogol", "WarpGogol" in any case variation (case-insensitive match).
>
> This applies to all text in skill files, including frontmatter `description` and `triggers` fields, instruction text, and examples.
>
> It does NOT apply to:
>
> - **Generic "RFC"/"ADR" terms** — forge IS an RFC/ADR governance framework; these terms are domain vocabulary.
> - **Generic placeholder ids** — "RFC-XXXX", "ADR-XXXX" (literal X's) are illustrative, not platform references.
> - **File paths** — `adr-0000-template.md`, `rfc-0000-template.md` are file names, not RFC/ADR id references.
> - **Binding key names** in `ref()` calls — `ref(forge.yaml bindings.commands.validateRfc)` contains "Rfc" as a binding key, not as an RFC id reference.
> - **Code comments in TypeScript source files** — only `.md` skill files are in scope.

### Cleanup of existing skills

All `packages/forge/skills/**/*.md` files are scanned and cleaned:

1. **Remove specific platform RFC/ADR id references** — replace with generic descriptions. For example, "cumulative knowledge pattern (RFC-0524)" becomes "cumulative knowledge pattern", "Compass terminology (RFC-0353)" becomes "Compass terminology", "ADR lifecycle (RFC-0367, full RFC parity)" becomes "ADR lifecycle (full RFC parity)".
2. **Remove or replace "WGogol"/"WebGogol"/"WarpGogol"** with "Forge" or "project" depending on context. For example, "WGogol standards" becomes "Forge standards", "WGogol ecosystem" becomes "project ecosystem".
3. **Keep generic "RFC"/"ADR" terms** — these are forge's domain vocabulary and must remain.
4. **Keep generic example ids** like "RFC-XXXX", "ADR-XXXX", "RFC-0362" (when used as a generic example, not a reference to this platform's RFC-0362).
5. **Keep `rfc.validate` / `adr.validate` command references** — these are forge CLI commands, not platform-specific references. They are already covered by SKILL-11 binding key rules.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/**/*.md` | Cleaned of specific platform RFC/ADR ids and WGogol names |
| `packages/forge/src/validators/skill-validate.ts` | Add SKILL-17 check (RFC-NNNN/ADR-NNNN + platform names) |
| `packages/forge/AGENTS.md` | Document SKILL-17 rule alongside SKILL-11..16 |

### Failure modes

- **False positive on generic example ids** — "RFC-0362" used as a generic example in instruction text would match `RFC-\d{4}`. Mitigation: cleanup replaces specific platform RFC references with generic descriptions; remaining `RFC-\d{4}` patterns after cleanup are genuine platform references and should be flagged.
- **False positive on file paths** — `adr-0000-template.md` contains "0000" but is a file name, not an ADR id reference. Mitigation: SKILL-17 matches `\bADR-\d{4}\b` (word-boundary, case-sensitive), which does not match lowercase `adr-0000-template.md`.
- **Binding key names contain "Rfc"** — `validateRfc` in binding keys is allowed (not an RFC id). Mitigation: SKILL-17 matches `RFC-\d{4}` (hyphen + 4 digits), not bare "Rfc" in camelCase identifiers.
- **Existing skills have many references** — cleanup may be large. Mitigation: clean one file at a time, verify with `forge.skill.validate` after each.
- **Validator exits non-zero on first violation** — `forge.skill.validate` returns all violations in one pass. Exit code 1 indicates violations exist; the violations array provides file-level detail.

## Rollout

- **Default behavior**: SKILL-17 is enforced from day one. `forge.skill.validate` fails on any skill containing specific platform RFC/ADR ids or platform names.
- **Existing skills**: cleaned in the same implementation commit.
- **New skills**: must comply with SKILL-17 from creation.
- **Integration**: `forge.skill.validate` is already part of `forge.doctor` and the build pipeline.
- **AGENTS.md update**: `packages/forge/AGENTS.md` must document SKILL-17 alongside the existing SKILL-11..16 documentation in the Skills section.

## Alternatives considered

1. **Soft warnings instead of hard failure** — rejected because internal platform references in consumer-facing skills are a quality issue, not a style preference. Hard failure ensures cleanup.

2. **Prohibit all "RFC"/"ADR" terms** — rejected because forge IS an RFC/ADR governance framework. The terms "RFC" and "ADR" are forge's domain vocabulary, not internal platform references. Prohibiting them would make skill files meaningless (e.g., "RFC Audit" skill cannot avoid the word "RFC").

3. **Regex-based automated replacement** — rejected as the sole mechanism because context matters. Specific RFC references in different contexts need different replacements (generic description, removal, or rewording). Manual cleanup with validation enforcement is more reliable.

## Risks

- **False positives on generic example ids** — instruction text using "RFC-0362" as a generic example would match the `RFC-\d{4}` pattern. Mitigation: cleanup replaces all specific platform RFC references with generic descriptions; after cleanup, any remaining `RFC-\d{4}` pattern is a genuine violation.
- **Binding key names** — `validateRfc` in `ref()` calls contains "Rfc" but not `RFC-\d{4}`. Mitigation: SKILL-17 matches `RFC-\d{4}` (hyphen + 4 digits), not bare "Rfc" in camelCase identifiers.
- **Cleanup introduces errors** — removing RFC references may break skill instructions that depend on them for context. Mitigation: run `forge.skill.validate` after each file cleanup; manually verify instruction clarity.
- **Maintenance burden** — new skills may accidentally introduce specific platform RFC/ADR references. Mitigation: `forge.skill.validate` catches this in CI.
- **Skill knowledge files** — `_shared/` files and knowledge files (e.g., `fo-pipeline-conventions.md`) also contain platform RFC references. Mitigation: SKILL-17 applies to all `packages/forge/skills/**/*.md` files, including `_shared/` and knowledge files.

## Acceptance criteria

- [x] SKILL-17 is added to forge.skill.validate prohibiting specific platform RFC/ADR ids (RFC-\d{4}, ADR-\d{4}) and platform names (WGogol, WebGogol, WarpGogol) in skill files (evidence: packages/forge/src/validators/skill-validate.ts:493-548, checkSkill17 function with SKILL17_ID_PATTERNS and SKILL17_PLATFORM_PATTERNS)
- [x] SKILL-17 allows generic "RFC"/"ADR" terms and generic placeholder ids (RFC-XXXX, ADR-XXXX) (evidence: packages/forge/src/tests/skill-validate.test.ts:122-130, pattern test confirms RFC-XXXX does not match, bare RFC/ADR terms do not match)
- [x] SKILL-17 excludes file paths (adr-0000-template.md) and binding key names (validateRfc) from the prohibition (evidence: packages/forge/src/tests/skill-validate.test.ts:132-135, pattern test confirms lowercase file paths do not match; SKILL17_ID_PATTERNS uses case-sensitive \bRFC-\d{4}\b which does not match camelCase validateRfc)
- [x] All existing packages/forge/skills/**/*.md files are cleaned of specific platform RFC/ADR id references and platform name references (evidence: grep -rnE 'RFC-[0-9]{4}|ADR-[0-9]{4}' packages/forge/skills/ returns zero matches; grep -rnE '\bWGogol\b|\bWebGogol\b|\bWarpGogol\b' packages/forge/skills/ returns zero matches excluding @warpgogol/forge npm package name)
- [x] forge.skill.validate passes on all cleaned skill files (evidence: pnpm exec site-kernel run forge.skill.validate --json returns status: pass, 0 violations)
- [x] packages/forge/AGENTS.md documents SKILL-17 alongside SKILL-11..16 (evidence: packages/forge/AGENTS.md:87, SKILL-17 bullet added in bindings contract section; packages/forge/AGENTS.md:51, pack skills section updated)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate --json returns ok: true, zero errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add specific platform RFC/ADR ids (RFC-NNNN, ADR-NNNN) or WGogol/WebGogol/WarpGogol names to Forge skill files.
- Agents MUST NOT weaken or remove SKILL-17 enforcement without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
