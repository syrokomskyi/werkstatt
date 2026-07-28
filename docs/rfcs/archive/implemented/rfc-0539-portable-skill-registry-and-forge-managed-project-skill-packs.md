---
id: RFC-0539
title: "Portable skill registry and forge-managed project skill packs"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0374
  - RFC-0391
  - RFC-0393
  - RFC-0523
  - RFC-0524
  - ADR-0003
  - DNA-54
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
    - forge.init
    - forge.skill.validate
    - forge.skill.list
    - forge.doctor
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
  - wgogol-skills
successSignals:
  - "FORGE_SKILLS contains only skills that run in any forge-bootstrapped project without WGogol-specific directories or commands"
  - "forge.skill.validate validates project skill packs declared in forge.yaml, including prefix enforcement"
  - "npm consumers never receive mission-complete, site-scan, or any other ecosystem-bound skill"
nonGoals:
  - "Publishing project skill packs to npm — packs are project-local by definition"
  - "Backward-compatible aliases for renamed skills — forward-only rename"
  - "A central marketplace or discovery mechanism for third-party skill packs"
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

# RFC-0539: Portable skill registry and forge-managed project skill packs

## Context

`@wgogol/forge` (RFC-0374) is being prepared for npm publication so that any external project can adopt it. The package ships its skill definitions from `packages/forge/skills/` — every entry in `FORGE_SKILLS` (`packages/forge/src/registry.ts`) is copied into a consumer's `.agents/skills/` by `forge.init` and is included in the npm `files` array.

Two skills currently registered in `FORGE_SKILLS` are not portable:

- `mission-complete` (`skills/fo/mission-complete/`) — requires the WGogol mission lifecycle (`missions/`, `systems/`, `mission.validate`, `release.prepare`), which exists only in this monorepo.
- `fo-site-scan` (`skills/fo/fo-site-scan/`) — requires `page.block.validate` and a WGogol site dev server.

ADR-0003 already established `packages/wgogol-skills/` as the home for WGogol-specific skills (`onboard`, `mission-reconcile`), private and never published. However, ADR-0003 deliberately left those skills outside forge's management: no registry, no frontmatter validation, a separate flat-copy sync script, and no naming convention that distinguishes them from forge skills.

As forge heads to npm, this split becomes a contract question: which skills travel with the package, which stay in the project, and how does a project grow its own skills under forge governance?

## Problem

- `FORGE_SKILLS` leaks ecosystem-bound skills into the npm artifact. An external consumer running `forge.init` receives `mission-complete` and `fo-site-scan`, which reference commands and directories that do not exist in their project. The skills fail confusingly instead of never arriving.
- There is no machine-checkable portability criterion. Whether a skill belongs in forge or in the project is enforced by reviewer discipline only.
- Project-local skills (`packages/wgogol-skills/skills/`) are unmanaged: no frontmatter validation (`forge.skill.validate` skips them), a parallel sync mechanism, and no prefix rule. ADR-0003 accepted this as temporary debt ("postpone until the count justifies it") — the count now grows, and forge's npm launch is the right moment to close it.
- The `fo-` prefix is not reserved. A project could create its own `fo-*` skill and collide with a future forge release.

## Decision

`FORGE_SKILLS` becomes a purely portable registry: every registered skill MUST run in any forge-bootstrapped project using only forge commands, forge bindings, and standard project files. Ecosystem-bound skills move to project skill packs — directories declared in `forge.yaml` under a new `skillPacks` section — which forge synchronizes, validates, and doctors exactly like its own skills, under a mandatory project-specific prefix. The `fo-` prefix is reserved for forge-shipped skills.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — this RFC extends DNA-54's de-hardcoding principle from literal values in skill bodies to skill location declarations. Just as DNA-54 requires project-specific commands and paths to be declared in `forge.yaml` `bindings` rather than hardcoded in skill instruction lines, `skillPacks` requires project-specific skill directories to be declared in `forge.yaml` rather than baked into forge source. The same config-over-hardcode philosophy, applied at the skill-location level.
- **RFC-0374 (forge extraction)** — completes the portability promise: the npm artifact contains only what works everywhere.
- **RFC-0393 (bindings contract)** — skill packs are the skill-level analogue of bindings: project-specific material referenced from config.
- **RFC-0523 / RFC-0524** — the concerns taxonomy and cumulative knowledge pattern apply unchanged to pack skills; `forge.skill.validate` enforces SKILL-01..13 on them.
- **ADR-0003** — this RFC supersedes ADR-0003's non-management stance (no validation, separate sync, no prefix) while keeping its core decision (separate private package) intact. ADR-0003 gains an `amendedBy`-style note referencing this RFC.

## Design

### Skill relocation and renames (forward-only, no aliases)

| Current | New home | New name |
| --- | --- | --- |
| `packages/forge/skills/fo/mission-complete/` | `packages/wgogol-skills/skills/wg-mission-complete/` | `wg-mission-complete` |
| `packages/forge/skills/fo/fo-site-scan/` | `packages/wgogol-skills/skills/wg-site-scan/` | `wg-site-scan` |
| `packages/wgogol-skills/skills/onboard/` | `packages/wgogol-skills/skills/wg-onboard/` | `wg-onboard` |
| `packages/wgogol-skills/skills/mission-reconcile/` | `packages/wgogol-skills/skills/wg-mission-reconcile/` | `wg-mission-reconcile` |

Knowledge files (RFC-0524) move with their skills. References to old names in other skills, AGENTS.md files, and workflows are updated in the same change. Old copies under `.agents/skills/` are detected by `forge.doctor` as stale and must be removed manually or by a targeted cleanup — `forge.init` overwrites existing skill directories but does not delete directories for skills no longer in the registry or packs.

### forge.yaml contract

```yaml
skillPacks:
  - prefix: wg
    dir: packages/wgogol-skills/skills
```

- `prefix` — mandatory, `^[a-z][a-z0-9]{1,7}$`, must not be `fo` (reserved for forge), unique across packs.
- `dir` — project-relative directory containing `<prefix>-<name>/SKILL.md` entries. Must be unique across packs — two packs may not point to the same directory (`forge.doctor` reports this as invalid config).

### TypeScript contracts

```ts
// packages/forge/src/config/forge-config.ts
interface ForgeSkillPack {
  prefix: string; // validated: ^[a-z][a-z0-9]{1,7}$, !== "fo"
  dir: string;    // project-relative
}
// ForgeConfig gains: skillPacks?: ForgeSkillPack[]

// packages/forge/src/registry.ts
// FORGE_SKILLS: unchanged shape; mission-complete and fo-site-scan entries removed.
// New invariant documented on the type: every entry MUST be portable.
```

### Command behavior changes

| Command | Change |
| --- | --- |
| `forge.init` | After syncing `FORGE_SKILLS`, syncs every declared skill pack into `.agents/skills/` (same copy semantics, including knowledge files). |
| `forge.skill.validate` | Validates pack skills against SKILL-01..13 plus new rules: SKILL-14 (pack skill name must start with its pack prefix), SKILL-15 (no skill outside forge may use the `fo-` prefix). SKILL-15 applies to all skills under validation — forge skills and pack skills. Stray copies in `.agents/skills/` that are neither forge nor pack skills are not validated by `forge.skill.validate`; `forge.doctor` detects them as stale. SKILL-07 (dependsOn must reference existing skill names) is extended with asymmetric dependency direction: the known-names set includes both `FORGE_SKILLS` entries and pack skill names. Pack skills may declare `dependsOn` on forge skills or other pack skills. Forge skills may only depend on other forge skills — depending on a pack skill is a SKILL-07 violation (breaks portability). |
| `forge.skill.list` | Lists pack skills with a `pack: <prefix>` column alongside forge skills. |
| `forge.doctor` | Reports stale/missing pack skill copies in `.agents/skills/` and invalid `skillPacks` config. |

The `wgogol-skills` package's own `sync` script (ADR-0003) is removed — `forge.init` is the single sync path.

### File system responsibilities

| Path                                  | Role                                               |
| ------------------------------------- | -------------------------------------------------- |
| `packages/forge/src/registry.ts`      | `FORGE_SKILLS` — portable entries only             |
| `packages/forge/skills/**`            | Portable skills shipped to npm                     |
| `packages/wgogol-skills/skills/wg-*/` | WGogol skill pack (private, prefix `wg`)           |
| `forge.yaml` `skillPacks`             | Pack declaration read by init/validate/list/doctor |
| `.agents/skills/`                     | Sync target for both forge skills and pack skills  |

### Output format

`forge.skill.validate --json` gains pack-aware entries:

```json
{
  "command": "forge.skill.validate",
  "status": "fail",
  "violations": [
    { "skill": "wg-onboard", "pack": "wg", "rule": "SKILL-14", "message": "skill name must start with pack prefix 'wg-'" }
  ]
}
```

### Performance notes

`forge.skill.validate` scans `packages/forge/skills/` (existing) plus each declared pack directory. Cost is proportional to the total number of skills across forge and all packs — typically < 50 skills, each requiring a frontmatter parse and body scan. No recursive filesystem walk; only declared directories are scanned. Negligible compared to `build.check`.

### Failure modes

- Invalid `skillPacks` entry (bad prefix, missing dir) → `forge.doctor` and `forge.skill.validate` fail with exit 1 and a pointer to this RFC.
- Pack skill without the pack prefix → SKILL-14 error.
- Non-forge skill using `fo-` prefix → SKILL-15 error.
- `skillPacks` absent → all commands behave exactly as today (packs are opt-in).

## Rollout

1. Add `skillPacks` schema to `forgeConfigSchema` and `forge.yaml` in this monorepo (`prefix: wg`, `dir: packages/wgogol-skills/skills`).
2. Move and rename the four skills (table above), updating internal references and knowledge files.
3. Remove the two entries from `FORGE_SKILLS`; extend `forge.init`, `forge.skill.validate` (SKILL-14/15), `forge.skill.list`, `forge.doctor`.
4. Remove the `wgogol-skills` sync script; run `forge.init` sync to refresh `.agents/skills/` (old-name copies deleted).
5. Update `packages/forge/AGENTS.md`, `packages/wgogol-skills` docs, `packages/AGENTS.md` (add `wgogol-skills` to the ownership table with prefix/validation info), `docs/technology.xml` (update `pkg-forge` role description if skill count changes), and ADR-0003 with a superseding note.

External consumers are unaffected until they opt into `skillPacks`; new projects get the section documented (empty) by `forge.init`.

## Alternatives considered

- **`portability: universal | ecosystem` field on `ForgeSkillEntry`** — keeps one registry but ships ecosystem skill files to npm anyway (they live in `packages/forge/skills/`), and blurs the boundary ADR-0003 drew. Rejected: the package boundary is the honest portability criterion.
- **Leave pack skills unmanaged (ADR-0003 status quo)** — rejected: two sync mechanisms and zero validation is accepted debt that becomes a support burden the moment external projects copy the pattern.
- **Publish a separate `@wgogol/wgogol-skills` npm package** — rejected: ecosystem skills are meaningless outside this monorepo; `private: true` stands.

## Risks

- **Rename churn** — references to `mission-complete`, `onboard`, `mission-reconcile`, `fo-site-scan` exist in memories, AGENTS.md files, and workflows; a missed reference invokes a non-existent skill. Mitigation: repo-wide grep in the implementation step; forward-only policy keeps the fix trivial (rename at call site).
- **Prefix squatting** — a project could choose a prefix that a future forge feature wants. Mitigation: only `fo` is reserved; collisions among project packs are the project's own namespace to manage.
- **Agent misinterpretation** — an agent might re-add an ecosystem skill to `FORGE_SKILLS` "for convenience". Mitigation: the portability invariant is stated on the type and enforced in review; SKILL-15 blocks the reverse direction (`fo-` squatting).
- **Validator false positives** — SKILL-14 and SKILL-15 use deterministic prefix matching (string startsWith), not heuristic pattern matching. False-positive rate is zero by construction: a skill either starts with the prefix or it does not. No suppression mechanism is needed.

## Acceptance criteria

- [x] `ForgeSkillPack` type and `skillPacks` schema exist in `packages/forge/src/config/forge-config.ts`; invalid prefixes (including `fo`) are rejected by the schema (evidence: packages/forge/src/config/forge-config.ts:67-148, forgeSkillPackSchema with `.refine()` rejecting `fo` prefix)
- [x] `FORGE_SKILLS` contains no entry requiring WGogol-specific directories or commands; `mission-complete` and `fo-site-scan` entries are removed (evidence: packages/forge/src/registry.ts — FORGE_SKILLS array, grep returns no results)
- [x] The four skills exist under `packages/wgogol-skills/skills/` with `wg-` names and their knowledge files; old directories are deleted (evidence: packages/wgogol-skills/skills/wg-mission-complete/, wg-site-scan/, wg-onboard/, wg-mission-reconcile/ — all with SKILL.md + knowledge files; old directories removed)
- [x] `forge.init` syncs declared pack skills into `.agents/skills/` alongside forge skills (evidence: packages/forge/src/onboarding/init.ts:170-213, discoverPackSkills loop after FORGE_SKILLS loop)
- [x] `forge.skill.validate` enforces SKILL-14 and SKILL-15 with `--json` violations as specified (evidence: packages/forge/src/validators/skill-validate.ts:335-353, SKILL-14 prefix check + SKILL-15 fo- prefix reservation)
- [x] `forge.doctor` reports stale/missing pack copies and invalid `skillPacks` config (evidence: packages/forge/src/onboarding/doctor.ts:243-311, checkPackSkills function)
- [x] `wgogol-skills` standalone sync script is removed; `forge.yaml` declares the `wg` pack (evidence: packages/wgogol-skills/sync.mjs deleted, forge.yaml:56-58 skillPacks section)
- [x] `packages/forge/AGENTS.md`, `packages/AGENTS.md` (ownership table), and ADR-0003 updated to reference this RFC (evidence: packages/forge/AGENTS.md:10,40-54 skill packs section; packages/AGENTS.md:56 wgogol-skills ownership entry; docs/adrs/adr-0003-wgogol-skills-package.md:11-16,59 supersededBy RFC-0539)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate rfc-0539 --json` returns status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT add any skill to `FORGE_SKILLS` that references WGogol-specific commands (`mission.*`, `sternsystem.*`, `page.block.validate`, `pnpm exec site-kernel run` outside bindings) or directories (`missions/`, `systems/`, `onboarding/`).
- Agents MUST NOT create backward-compatibility aliases for the renamed skills — forward-only.
- Agents MUST NOT re-add the `wgogol-skills` standalone sync script; `forge.init` is the single sync path after this RFC.
- When renaming, agents MUST update every reference found by a repo-wide search for the old skill names, including `.windsurf/workflows/`, AGENTS.md files, and skill cross-references.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0539 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
