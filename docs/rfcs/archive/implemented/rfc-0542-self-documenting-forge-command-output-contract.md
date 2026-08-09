---
id: RFC-0542
title: Self-documenting forge command output contract
status: implemented
kind: contract
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- RFC-0374
- RFC-0391
- RFC-0539
- RFC-0540
- DNA-54
satisfies:
- DNA-54
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
  - forge.scaffold
  - forge.doctor
  - forge.skill.validate
  - forge.skill.list
  - rfc.validate
  - rfc.create
  - adr.validate
  - adr.create
  - spec.validate
  - spec.materialize
  - docs.archive
  removed:
  - forge.init
appsImpacted: []
packagesImpacted:
- forge
successSignals:
- Every forge command's pretty output ends with a Next steps block (may be empty for pass-state validators)
- Every forge command's --json output includes a nextSteps array
- forge.init and forge.create output recommends Windsurf as the tested IDE and names alternatives without guarantee
- All forge CLI natural-language output is English regardless of PREFERENCES.md aiLanguage
nonGoals:
- Translating CLI output into the operator's aiLanguage — PREFERENCES.md governs agent chat, not the forge binary
- Self-documenting output for site-kernel commands — this RFC covers the forge CLI surface only
- Interactive TUI wizards — output is text, choices are made via flags and the bootstrap skill

---

# RFC-0542: Self-documenting forge command output contract

## Context

`@wgogol/forge` is heading to npm for use in arbitrary external projects. Its CLI (`bin/cli.ts`) has a hand-maintained `printHelp` that is already stale — it omits `docs.archive`, session commands, and spec commands. Individual command handlers return `KernelCommandResult`-shaped objects; the CLI prints `result.data` as JSON in `--json` mode and nothing structured in pretty mode. There is no contract that a command output tells the operator what to do next.

For an external consumer opening forge for the first time, the CLI is the entire interface. A command that succeeds silently, or that prints a result without indicating the next action, forces the operator to read documentation out-of-band. The operator's requirement is explicit: all forge commands must be self-documenting, with concise guidance on what the operator must or can do next, and an IDE recommendation (Windsurf tested, others without guarantee) at project-creation moments.

## Problem

- No command is required to produce next-step guidance. A successful `forge.init` prints created files and stops; the operator does not know whether to open the IDE, run a skill, or edit `forge.yaml`.
- `printHelp` is hand-maintained and already out of sync with the registered command set (missing `docs.archive`, `session.*`, `spec.*`). New commands will drift the same way.
- `--json` output has no `nextSteps` field, so agents and scripts consuming forge programmatically cannot determine follow-up actions without hardcoded knowledge.
- No IDE recommendation exists anywhere in the CLI. External consumers do not know which IDE forge was tested on.
- CLI output language is unspecified. `PREFERENCES.md` `aiLanguage` governs agent chat, not the forge binary; without an explicit rule, a contributor might localize CLI strings and create an inconsistent experience across environments.

## Decision

Every forge CLI command's output ends with a **Next steps** block in pretty mode and a `nextSteps` array in `--json` mode. Each entry is `{ action: string, kind: "required" | "optional" }`. Commands that have no follow-up (e.g. a validator at `pass`) emit an empty array/block. `forge.init` and `forge.create` additionally print an IDE recommendation: Windsurf (tested) first, alternatives (VS Code, Cursor, etc.) without guarantee. All forge CLI natural-language output is English regardless of `PREFERENCES.md`. `printHelp` is generated from the registry, not hand-maintained.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — the `nextSteps` field extends the de-hardcoding principle of DNA-54 from skill instruction bodies to command output. DNA-54 requires that skill bodies reference project-specific values via `ref(forge.yaml bindings.*)` instead of hardcoding literals; `nextSteps` applies the same principle to command results — agents and scripts consuming `--json` read structured `nextSteps` entries instead of parsing prose or hardcoding follow-up actions. The invariant ("no hardcoded project-specific literals in machine-consumable surfaces") is extended from `packages/forge/skills/**/*.md` to `ForgeCommandResult.data`.
- **RFC-0374 (forge extraction)** — the CLI is forge's public face in external projects; self-documentation is the portability promise made observable.
- **RFC-0391 (portable init)** — `forge.init` is the primary moment an external consumer meets forge; its output is where the next-step contract is most visible.
- **RFC-0539 / RFC-0540** — skill packs and binding defaults are prerequisites for a working project; this RFC ensures the operator is told to run the bootstrap skill and which IDE to open.

## Design

### Next steps block (pretty mode)

Every command's pretty output ends with:

```text
Next steps:
  • <required action>        [must do]
  • <optional action>        [can do]
```

Empty for pass-state validators. Non-empty for lifecycle commands (`init`, `create`, `scaffold`, `doctor`, `upgrade`) and for fail-state validators (the next step is typically "fix the violations above and re-run").

### IDE recommendation (init and create only)

`forge.init` and `forge.create` print, after the Next steps block:

```text
Recommended IDE: Windsurf (tested with forge). Other IDEs (VS Code, Cursor)
work but are not tested.
```

### --json output contract

```ts
interface ForgeNextStep {
  action: string;             // imperative sentence, English
  kind: "required" | "optional";
}
// ForgeCommandResult.data gains: nextSteps: ForgeNextStep[]
```

```json
{
  "command": "forge.init",
  "status": "pass",
  "nextSteps": [
    { "action": "Open the project in Windsurf", "kind": "required" },
    { "action": "Run /forge-bootstrap to configure the project", "kind": "optional" }
  ]
}
```

### Generated help

`printHelp` is replaced by a registry-driven generator. The current `printHelp` (`bin/cli.ts:172-220`) is already hybrid — a hand-maintained command list at the top, followed by a generated "Registered commands" section from `registry.listCommandNames()`. The RFC removes the hand-maintained list entirely; the generator iterates `registry.listCommands()` and groups by module. A `--help <command>` flag prints per-command flags and a one-line description from the registered `ForgeCommandDefinition`.

### TypeScript contracts

```ts
// packages/forge/src/types.ts
interface ForgeNextStep {
  action: string;
  kind: "required" | "optional";
}
// ForgeCommandResult.data is extended with nextSteps?: ForgeNextStep[]
// (optional so existing handlers migrate incrementally; forge.create/init/doctor
//  MUST set it from day one)

// packages/forge/bin/cli.ts
function renderNextSteps(steps: ForgeNextStep[]): string;
function renderIdeRecommendation(): string;
function generateHelp(registry: ForgeCliRegistry): string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/bin/cli.ts` | `renderNextSteps`, `renderIdeRecommendation`, `generateHelp`; remove hand-maintained help |
| `packages/forge/src/types.ts` | `ForgeNextStep` type |
| `packages/forge/os/**` | Each command handler populates `nextSteps` in its result |

### Output format

See the `--json` and pretty-mode examples above.

### Failure modes

- A handler returns no `nextSteps` → the CLI prints an empty block in pretty mode and `[]` in JSON. No error; the contract is additive.
- A handler returns a next step with `kind` outside the enum → `forge.skill.validate`-style lint could catch this; for now, TypeScript narrowing enforces it at compile time.
- `--help <unknown-command>` → exit 1 with a pointer to `forge --help`.
- A `nextSteps` entry references a command not registered in autonomous mode (e.g. `compass.validate`, `werkstatt.*` which gracefully skip when `@gogol/*` imports fail) → no filtering is applied. `nextSteps` entries are natural-language imperative sentences (guidance), not structured command references. The operator or agent reading them is expected to check `forge --help` for available commands in their environment. Filtering would require parsing prose, which defeats the simplicity of the contract.

## Rollout

1. Add `ForgeNextStep` type; extend `ForgeCommandResult.data` with `nextSteps?`.
2. Implement `renderNextSteps`, `renderIdeRecommendation`, and registry-driven `generateHelp` in `bin/cli.ts`; remove the hand-maintained command list.
3. Populate `nextSteps` in `forge.init`, `forge.scaffold`, `forge.doctor`, and in fail-state results of validators. Pass-state validators may leave the array empty.
4. Add `--help <command>` flag.
5. Unit-test `renderNextSteps`, `renderIdeRecommendation`, and `generateHelp`.

Existing handlers without `nextSteps` continue to work (additive contract); they are migrated as they are touched.

**Future commands.** RFC-0543 (`forge.upgrade`) and RFC-0544 (`forge.create`) are currently draft RFCs that propose new commands. When those RFCs are implemented, their command handlers MUST conform to the `nextSteps` contract from day one — this RFC establishes the output contract that all forge lifecycle commands follow.

## Alternatives considered

- **Lifecycle-commands-only scope** — rejected: the operator chose structural coverage of all commands. Validators at `fail` benefit from a next step ("fix and re-run"), and the `--json` `nextSteps` field is useful to agents consuming any command.
- **Interactive TUI wizard for init/create** — rejected: the operator specified text output with flags; the bootstrap skill handles dialogue.
- **Localize CLI output via PREFERENCES.md** — rejected: `aiLanguage` governs agent chat, not the binary. Localizing the CLI would fragment the npm experience across operator locales and complicate programmatic consumption.

## Risks

- **Stale next steps** — a handler's `nextSteps` hardcode guidance that drifts if commands change. Mitigation: steps are short imperative sentences referencing command names, not deep prose; review catches drift.
- **Help generator gaps** — a module that fails to register in autonomous mode (compass, werkstatt) will be absent from help. Mitigation: the generator iterates the live registry, so the help is always honest about what is available in this environment.
- **Agent misinterpretation** — an agent might treat `optional` next steps as required. Mitigation: the `kind` field is explicit; skill instructions that consume `nextSteps` must respect it.

## Acceptance criteria

- [x] `ForgeNextStep` type exists in `packages/forge/src/types.ts`; `ForgeCommandResult.data` includes optional `nextSteps: ForgeNextStep[]` (evidence: packages/forge/src/types.ts:35-46, commit f7fffaef6)
- [x] `forge.init`, `forge.scaffold`, `forge.doctor` populate `nextSteps` in both pretty and `--json` output (evidence: packages/forge/os/core/core.module.ts:43-87,152-162, packages/forge/src/onboarding/scaffold-project.ts:158-185, commit 67622a18d)
- [x] `forge.init` prints the IDE recommendation (Windsurf tested, alternatives without guarantee). `forge.create` will also print the recommendation when implemented by RFC-0544 (evidence: packages/forge/bin/cli.ts:298-300, commit 2bba7dcc7)
- [x] `printHelp` is generated from the registry; the hand-maintained command list in `bin/cli.ts` is removed (evidence: packages/forge/src/cli-output.ts:38-57, packages/forge/bin/cli.ts:188-214, commit 2bba7dcc7)
- [x] `--help <command>` flag prints per-command flags and description (evidence: packages/forge/bin/cli.ts:174-200,248-252, commit 2bba7dcc7)
- [x] All forge CLI natural-language output is English regardless of `PREFERENCES.md` (evidence: packages/forge/src/cli-output.ts — all strings are English; packages/forge/AGENTS.md:95, commit 2e8c9cc98)
- [x] Unit tests cover `renderNextSteps`, `renderIdeRecommendation`, and `generateHelp` (evidence: packages/forge/src/tests/cli-output.test.ts, 221 tests pass, commit bb4976d3d)
- [x] `packages/forge/AGENTS.md` updated with the output contract (evidence: packages/forge/AGENTS.md:89-99, commit 2e8c9cc98)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec werkstatt run rfc.validate — zero RFC-0542 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT localize forge CLI output into `aiLanguage` — the binary speaks English; `PREFERENCES.md` governs agent chat only.
- Agents MUST NOT hand-maintain the command list in `printHelp` — the generator is the single source.
- Agents MUST NOT omit `nextSteps` from `forge.init`, `forge.create`, `forge.scaffold`, `forge.doctor`, or `forge.upgrade` results.
- Agents MAY leave `nextSteps` empty for pass-state validators.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0542 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
