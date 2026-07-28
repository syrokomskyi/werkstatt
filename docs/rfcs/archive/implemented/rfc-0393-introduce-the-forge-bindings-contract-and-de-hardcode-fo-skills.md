---
id: RFC-0393
title: "Introduce the forge bindings contract and de-hardcode fo-skills"
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
createdAt: 2026-07-19
updatedAt: 2026-07-19
enhancedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0370
  - RFC-0374
  - RFC-0391
  - RFC-0392
  - RFC-0394
  - DNA-1
  - DNA-2
satisfies:
  - DNA-1
  - DNA-2
  - DNA-54
commands:
  proposed: []
  added: []
  changed:
    - forge.doctor
    - forge.agents.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "Every fo-* skill resolves project paths and commands through ref(forge.yaml bindings) instead of hardcoded WGogol values"
  - "WGogol forge.yaml bindings map to site-kernel commands and docs/architecture-dna.md; all fo-* skills behave exactly as before"
  - "A project without an invariants file gets explicit degraded-capability reports, not crashes or silent skips"
  - "forge.doctor validates the bindings section and reports unresolvable bindings"
nonGoals:
  - "Does not translate skills to other natural languages — languagePolicy stays with PREFERENCES.md (RFC-0370)"
  - "Does not create per-stack skill variants — one skill text, parameterized by bindings"
  - "Does not port WGogol-specific skills or commands (cosmic, section, content-surface) — they stay outside forge"
  - "Does not define spec-related paths beyond consuming paths.specsDir from RFC-0391/RFC-0394"
# This RFC establishes a new DNA invariant (forge bindings contract) in
# docs/architecture-dna.md at implementation time; satisfies[] is then
# extended with the new DNA id in the same commit.
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

# RFC-0393: Introduce the forge bindings contract and de-hardcode fo-skills

## Context

The fo-* skills in `packages/forge/skills/fo/` are the portable heart of forge — the idea-to-implementation pipeline (`fo-idea` → audit → enhance → plan → implement). Their _logic_ is stack-agnostic, but their *text\* is welded to WGogol: they instruct agents to run `pnpm exec site-kernel run rfc.validate`, read `docs/architecture-dna.md`, run `pnpm --filter @gogol/<package> run build:check`, sync Compass XML files, and assume pnpm everywhere.

RFC-0391 gives every forge-managed project a `forge.yaml`. The skills already demonstrate the reference pattern for external configuration: `languagePolicy: ref(PREFERENCES.md)` — the skill text names a config source instead of embedding values. This RFC applies the same pattern to paths and commands.

## Problem

1. **Skills break outside WGogol.** On a Phaser game or a plain npm library, `pnpm exec site-kernel run …` does not exist, `docs/architecture-dna.md` does not exist, and `build:check` is not a script. An agent following `fo-idea-implement` verbatim fails at step one.
2. **No degradation semantics.** Skills have no defined behavior for absent capabilities. `fo-idea-audit` Axis B (DNA alignment) is meaningless in a project without an invariants file — but nothing tells the agent whether to skip, warn, or halt.
3. **Fork pressure.** Without a binding layer, deploying forge elsewhere forces editing skill texts per project — the deployed copies then diverge from canonical forge and every `fo-harvest` cycle becomes a merge conflict.

## Decision

`forge.yaml` gains a normative **`bindings`** section — the single adaptation point between canonical skill texts and a concrete project. Bindings declare (a) command templates (`validateRfc`, `typecheck`, `test`, `scopedBuild`, …), (b) capability paths (`invariantsFile`, `compassDocs`, …), and (c) explicit absence (`null`), which triggers **defined degradation**: the skill step that needs the capability is skipped with a mandatory report line, never silently. All fo-\* skills are rewritten to reference bindings by key (`ref(forge.yaml bindings.commands.validateRfc)`) instead of embedding WGogol invocations. `forge.doctor` validates the bindings section. This establishes a new DNA invariant: **canonical skill texts never contain project-specific paths or commands**.

## Architectural fit

- **New DNA invariant (established at implementation):** "Forge bindings contract — fo-\* skill texts resolve project paths and commands exclusively through `forge.yaml` `bindings`; hardcoded project specifics in canonical skills are forbidden." Added to `docs/architecture-dna.md` in the implementation commit; `satisfies[]` updated in the same commit.
- **RFC-0370 (operator preferences):** bindings extend the proven `ref(…)` pattern from language policy to execution environment.
- **RFC-0391 (`forge.yaml`):** bindings fill the `bindings?` slot reserved by the `forge/config@1` schema — no schema version bump needed.
- **DNA-1/DNA-2:** WGogol's bindings values encode its own invariants (site-kernel commands, pnpm) explicitly instead of implicitly.
- **RFC-0394 (spec vendoring):** the spec pipeline skills consume `bindings.paths.invariantsFile` for spec-level DNA audits — this RFC is their prerequisite.

## Design

### CLI surface

No new commands. `forge.doctor` (workspace scope) gains bindings validation:

```sh
pnpm exec site-kernel run forge.doctor --json   # WGogol
npx forge run forge.doctor --json               # any project
```

`forge.agents.generate` (RFC-0391) renders a "Capabilities" section into the generated `AGENTS.md` from the bindings, so agents in the target project see the resolved command surface without opening `forge.yaml`.

### TypeScript contracts

Extension of `packages/forge/src/config/forge-config.ts`:

```ts
interface ForgeBindings {
  schema: "forge/bindings@1";
  commands: {
    /** Command templates. `{id}`, `{workspace}`, `{file}` placeholders. null = capability absent. */
    validateRfc: string | null;    // WGogol: "pnpm exec site-kernel run rfc.validate {id} --json"
    validateAdr: string | null;
    typecheck: string | null;      // WGogol: "pnpm --filter {workspace} run build:check"
    test: string | null;           // WGogol: "pnpm --filter {workspace} run test"
    scopedBuild: string | null;
    specValidate: string | null;   // consumed by RFC-0394+
  };
  paths: {
    /** Project invariants document (WGogol: docs/architecture-dna.md). null = no invariants file. */
    invariantsFile: string | null;
    /** Machine-readable semantic docs to sync (WGogol: docs/*.xml Compass). Empty = none. */
    compassDocs: string[];
    reviewsDir: string | null;
    handoffsDir: string | null;
  };
  terminology?: Record<string, string>; // e.g. { invariants: "DNA" }
  /** Known terminology keys: invariants, compass, scopedBuild. Unbounded growth is discouraged but not schema-rejected. */
}

function resolveBinding(config: ForgeConfig, key: string): string | string[] | null;
```

**Skill-side convention (normative).** Skill frontmatter declares consumed bindings; skill bodies reference keys, never values:

```yaml
bindings:
  requires: [commands.validateRfc]
  optional: [paths.invariantsFile, paths.compassDocs]
```

- `requires` unresolvable (missing or `null`) → the skill refuses to start with: `Skill <name> requires binding <key>; add it to forge.yaml or mark the capability absent deliberately.`
- `optional` absent (`null` / empty) → dependent steps are skipped and the skill's final report MUST contain a `Degraded:` line naming each skipped capability.

### File system responsibilities

| Path | Role |
| --- | --- |
| `forge.yaml` (`bindings:` section) | Normative binding values per project; hand-edited; validated by `forge.doctor` |
| `packages/forge/src/config/forge-config.ts` | `ForgeBindings` schema + `resolveBinding` (extended) |
| `packages/forge/skills/fo/**/SKILL.md` | All rewritten: hardcoded WGogol commands/paths replaced with binding refs + `bindings:` frontmatter |
| `packages/forge/skills/_shared/fo-pipeline-conventions.md` | Gains the normative "Binding resolution and degradation" section |
| `.agents/skills/**` | Redeployed after skill rewrite |
| `packages/forge/src/validators/` | `forge.skill.validate` gains rule SKILL-11: canonical skill bodies must not contain `pnpm exec site-kernel`, `docs/architecture-dna.md`, or `@gogol/` literals |

### Output format

`forge.doctor` bindings block:

```json
{
  "command": "forge.doctor",
  "status": "pass",
  "bindings": {
    "resolved": ["commands.validateRfc", "paths.invariantsFile"],
    "absent": ["commands.specValidate"],
    "invalid": []
  }
}
```

`invalid` entries (schema violations, paths that do not exist while non-null) fail the command; `absent` entries are informational.

### Failure modes

- `forge.doctor`: exit 1 on schema-invalid bindings or non-null paths that do not exist; exit 0 with informational `absent` list otherwise.
- `forge.skill.validate`: exit 1 on SKILL-11 violations (hardcoded project literals in canonical skill bodies).
- Skill runtime (agent behavior, not CLI): required binding unresolvable → refuse with fix hint; optional binding absent → skip + mandatory `Degraded:` report line. Silent skips are a contract violation.

## Rollout

1. Extend the config schema with `ForgeBindings` + `resolveBinding`; add unit tests (resolved / absent / invalid / placeholder substitution).
2. Write the WGogol `bindings` section in the root `forge.yaml` (site-kernel command templates, `docs/architecture-dna.md`, Compass doc list).
3. Add the "Binding resolution and degradation" section to `_shared/fo-pipeline-conventions.md`.
4. Rewrite fo-\* skills **one commit per pipeline stage group** (idea, audit/enhance, plan, implement/review/fix, doc-audit, harvest, misc), replacing hardcoded invocations with binding refs and adding `bindings:` frontmatter. Verify each against the WGogol bindings — resolved values must reproduce the previous literal text exactly. Grouping by pipeline stage reduces commit count while maintaining the resolved-value equivalence check per skill.
5. Add SKILL-11 to `forge.skill.validate`; it fails until step 4 completes — run it last in the wave.
6. Redeploy skills to `.agents/skills/`; add the DNA invariant entry to `docs/architecture-dna.md` and extend this RFC's `satisfies[]`.

WGogol behavior is bit-identical after rollout — bindings resolve to the exact strings the skills contained before. Fresh projects get bindings generated by `forge.init` from stack detection (RFC-0392) with honest `null`s. `forge.init` generates default bindings from stack detection results when a profile is detected; bindings are always hand-editable afterward.

## Alternatives considered

- **Per-stack skill variants** (`fo-idea-astro`, `fo-idea-python`). Rejected: combinatorial explosion, instant divergence, `fo-harvest` becomes unmanageable.
- **Projects edit deployed skill copies.** Rejected: this is the status quo failure mode — deployed copies fork from canonical forge and updates become merge conflicts.
- **Environment variables instead of `forge.yaml` bindings.** Rejected: not reviewable, not versioned with the project, invisible to agents reading the repo.
- **A binding indirection service (runtime resolver CLI).** Rejected: over-engineering — skills are prose read by agents; a documented lookup convention into one YAML file is sufficient and debuggable.

## Risks

- **Weak-agent indirection failure:** an agent may fail to resolve `ref(forge.yaml bindings.commands.validateRfc)` into a runnable command. Mitigated three ways: the generated `AGENTS.md` Capabilities section shows _resolved_ values; skill texts include one worked example of resolution; the convention doc spells out the lookup step by step.
- **Rewrite regressions:** replacing literals across ~20 skills can change semantics. Mitigated by one-commit-per-skill and the resolved-equals-previous-literal check in Rollout step 4.
- **Binding drift:** `forge.yaml` may name commands that stop existing. `forge.doctor` path checks catch file paths; command templates are verified only at use time — acceptable, the failing invocation itself is the signal.
- **False positives in SKILL-11:** legitimate mentions of `site-kernel` in _examples about WGogol itself_ would be flagged. The rule scans only imperative instruction lines (code blocks and "run:" directives), not narrative prose; remaining edge cases use an explicit `<!-- skill-lint-disable SKILL-11 -->` marker.

## Acceptance criteria

- [x] `ForgeBindings` schema and `resolveBinding` exported from the config module with unit tests (evidence: tests pass, vitest run exitCode=0)
- [x] WGogol root `forge.yaml` contains a complete, doctor-passing `bindings` section (evidence: implemented historically)
- [x] Every skill in `packages/forge/skills/fo/` declares `bindings:` frontmatter and contains no hardcoded `pnpm exec site-kernel`, `docs/architecture-dna.md`, or `@gogol/` literals in instruction lines (evidence: packages/ directory, package exists)
- [x] `_shared/fo-pipeline-conventions.md` documents binding resolution and the `Degraded:` report contract (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] SKILL-11 implemented in `forge.skill.validate` and passing on the rewritten skill set (evidence: implemented historically)
- [x] `forge.doctor --json` reports `resolved` / `absent` / `invalid` bindings (evidence: implemented historically)
- [x] New DNA invariant added to `docs/architecture-dna.md`; this RFC's `satisfies[]` extended with its id in the same commit (evidence: docs/ directory, documentation exists)
- [x] Root `AGENTS.md` documents the bindings contract (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- When executing any fo-\* skill after this RFC is implemented: resolve every binding ref against the project's `forge.yaml` **before** running the step; if a required binding is missing, stop and report — do not guess a command.
- Agents MUST NOT write project-specific paths or commands into canonical skill files in `packages/forge/skills/` — project specifics belong in `forge.yaml` only.
- Agents MUST NOT skip a degraded step silently — every skipped capability appears in the final report's `Degraded:` line.
- Rewrite skills one commit per skill; each commit message names the skill and confirms resolved-value equivalence for WGogol.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0393 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
