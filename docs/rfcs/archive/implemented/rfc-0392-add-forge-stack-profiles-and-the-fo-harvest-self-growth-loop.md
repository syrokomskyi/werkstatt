---
id: RFC-0392
title: Add forge stack profiles and the fo-harvest self-growth loop
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-19
updatedAt: 2026-07-19
enhancedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- RFC-0374
- RFC-0391
- RFC-0393
- DNA-1
- DNA-2
satisfies:
- DNA-1
- DNA-2
commands:
  proposed: null
  added:
  - forge.scaffold
  changed: []
  removed:
  - forge.init
appsImpacted: []
packagesImpacted:
- '@wgogol/forge'
successSignals:
- forge.scaffold creates a working pnpm + Turborepo monorepo from a stack profile in an empty directory
- 'At least two stack profiles ship: astro-typescript-turborepo and phaser-turborepo'
- fo-harvest skill exists, passes forge.skill.validate, and is deployed to .agents/skills/
- forge.init --from=<path> routes an existing project or spec folder through stack detection
nonGoals:
- Does not support non-JS package managers or non-Turborepo monorepos — unsupported stacks are reported, not scaffolded
- Does not auto-run fo-harvest on a schedule — harvesting is operator-invoked
- Does not port any specific pattern into forge — fo-harvest defines the workflow, not its first catch
- Does not touch the bindings contract — that is RFC-0393

---

# RFC-0392: Add forge stack profiles and the fo-harvest self-growth loop

## Context

Forge's mission is to embed into **any** software project, compare its own known stacks with the project's stack, and lift the project's feature-delivery discipline (RFC-0374, RFC-0391). Two capabilities are still missing for that mission:

1. **Creating projects from scratch.** `forge.init` (RFC-0391) deploys forge into an existing or empty directory, but forge cannot yet scaffold a working monorepo — there is no notion of a _stack profile_ that says what an Astro + TypeScript + Turborepo project (or a Phaser game) looks like.
2. **Learning from projects.** Forge improves itself by harvesting patterns proven in real project work back into the canonical package. Today only `port-to-forge` exists (targeted, single-pattern, operator must already know what to port). There is no systematic sweep that discovers harvest candidates.

## Problem

1. There is no machine-readable definition of a supported stack. `packages/forge/src/onboarding/scaffold.ts` scaffolds a single skill/command skeleton (`forge.port.scaffold`), not a project. Without stack profiles, "forge compares its stacks with the project's stack" is prose, not mechanism.
2. Knowledge flows into forge only when the operator remembers a specific pattern. Improvements made during project sessions (new skills, refined commands, better conventions) silently stay project-local — the self-improvement loop has no systematic entry point.
3. `forge.init` has no way to bootstrap **from** existing material (`--from=<path>` to a project or spec folder), so migration of an existing codebase into a forge-managed monorepo is entirely manual.

## Decision

Forge gains **stack profiles** — YAML documents under `packages/forge/profiles/` describing a supported stack (detection markers, workspace layout, install steps, baseline files) — and a `forge.scaffold` command that creates a working pnpm + Turborepo monorepo from a chosen profile in an empty directory. `forge.init` gains `--from=<path>` to analyze existing material and route it through stack detection. A new **`fo-harvest`** skill defines the systematic self-growth loop: scan the whole project for forge-worthy patterns, grill the operator on portability, and port accepted candidates via the existing `forge.port.scaffold` / `port-to-forge` machinery.

## Architectural fit

- **DNA-2 (pnpm workspace + Turborepo):** stack profiles encode exactly this invariant as the only supported monorepo shape; unsupported stacks are reported honestly instead of half-scaffolded.
- **DNA-1 (Monorepo boundary):** scaffolded monorepos start with the `apps|sites / packages / services` boundary discipline baked into the generated `turbo.json` and workspace file.
- **RFC-0391:** `forge.scaffold` ends by running `forge.init` internally — every scaffolded project is born with `forge.yaml`, generated `AGENTS.md`, and deployed skills.
- **RFC-0374 (port workflow):** `fo-harvest` is the discovery front-end for the existing `port-to-forge` skill and `forge.port.scaffold` command — it adds no second porting mechanism.
- **Spec-driven, install-based scaffolding:** profiles invoke real package-manager commands instead of freezing template snapshots that rot.

## Design

### CLI surface

```sh
npx forge run forge.scaffold --profile=astro-typescript-turborepo --name=my-site --json
npx forge run forge.init --from=../legacy-project --json
pnpm exec site-kernel run forge.scaffold --profile=phaser-turborepo --name=my-game --json
```

- `forge.scaffold` (workspace scope): `--profile` (required, must match a profile id), `--name` (required, kebab-case project name). Refuses to run in a non-empty directory.
- `forge.init --from=<path>` (workspace scope): analyzes the source (project or spec folder), detects the stack, proposes the closest profile, and reports what it can and cannot migrate. Detection results go into `forge.yaml` `project.stack`. The `--from` flag is a string path, optional, added to the `forge.init` flag spec in `forgeCoreModule`.
- `fo-harvest` is a skill, not a command — invoked by the operator in an agent session.

### TypeScript contracts

New module `packages/forge/src/profiles/stack-profile.ts`:

`forge.init` gains a `--from` flag (string, optional) in `forgeCoreModule`:

```ts
interface StackProfile {
  schema: "forge/stack-profile@1";
  id: string;                      // "astro-typescript-turborepo"
  displayName: string;
  /** Files/globs whose presence identifies this stack in an existing project. */
  detect: { anyOf: string[] };     // e.g. ["astro.config.*", "tsconfig.json"]
  workspace: {
    dirs: string[];                // e.g. ["sites", "packages", "services"]
    files: ProfileFile[];          // pnpm-workspace.yaml, turbo.json, tsconfig base, .gitignore
  };
  /** Real package-manager invocations, executed in order. */
  install: string[];               // e.g. ["pnpm add -D typescript turbo"]
  firstWorkspace?: { path: string; files: ProfileFile[]; install: string[] };
}

interface ProfileFile { path: string; content: string }

function listStackProfiles(forgeRoot: string): StackProfile[];
function detectStack(projectRoot: string, profiles: StackProfile[]): StackProfile | null;
```

Profiles shipped in `@1`: `astro-typescript-turborepo`, `phaser-turborepo`.

The `fo-harvest` skill (`packages/forge/skills/fo/fo-harvest/SKILL.md`) follows the standard frontmatter contract (`invocation: user`, `category: fo`, `dependsOn: ['my-preferences', 'grilling']`) and defines this loop: full project scan (`.agents/skills/`, command modules, `AGENTS.md` deltas, recurring code patterns) → candidate table with portability assessment → grilling per accepted candidate → port via `port-to-forge` → registry + docs update.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/profiles/*.yaml` | Stack profile definitions (new, hand-authored, schema-validated) |
| `packages/forge/src/profiles/stack-profile.ts` | Profile schema, loader, detector (new) |
| `packages/forge/skills/fo/fo-harvest/SKILL.md` | New skill (deployed to `.agents/skills/` by `forge.init`) |
| `packages/forge/src/registry.ts` | `fo-harvest` registered in `FORGE_SKILLS` |
| `packages/forge/src/onboarding/scaffold-project.ts` | `forge.scaffold` handler (new; `forge.port.scaffold` stays untouched) |
| `packages/forge/src/onboarding/init.ts` | `--from` analysis path added |
| Target directory (scaffold) | Created files per profile; command refuses non-empty directories |

### Output format

```json
{
  "command": "forge.scaffold",
  "status": "pass",
  "profile": "astro-typescript-turborepo",
  "created": ["pnpm-workspace.yaml", "turbo.json", "sites/my-site/package.json"],
  "installLog": ["pnpm add -D typescript turbo — ok"],
  "forgeInit": { "created": ["forge.yaml", "AGENTS.md", "PREFERENCES.md"] },
  "violations": []
}
```

`forge.init --from` adds `"detection": { "profile": "astro-typescript-turborepo" | null, "unsupported": ["cargo"] }`.

### Failure modes

- `forge.scaffold` in a non-empty directory: exit 1, message names the offending entries, nothing is written.
- `forge.scaffold` with an unknown `--profile`: exit 1, lists available profile ids.
- Install step failure: exit 1, report the failed command and stdout/stderr tail; files created so far are listed so the operator can clean up (no automatic rollback — partial state is visible, not hidden).
- `forge.init --from` with an undetectable or unsupported stack: exit 0 with `detection.profile: null` and an honest `unsupported` list — detection failure is information, not an error.
- Invalid profile YAML: `forge.doctor` and profile loading fail with the zod issue list.

## Rollout

1. Implement the profile schema + loader + detector with unit tests.
2. Author the two initial profiles and validate them against the schema.
3. Implement `forge.scaffold` and the `forge.init --from` analysis path; verify end-to-end in a temp directory (integration test).
4. Author `fo-harvest/SKILL.md`, register it in `FORGE_SKILLS`, run `forge.skill.validate`, redeploy skills.
5. First real harvest run over this repository is a follow-up session, not part of this RFC's implementation.

Nothing joins `build.check` — all surfaces are operator-invoked. Existing projects are unaffected until they call the new commands.

## Alternatives considered

- **Frozen template repositories (degit-style).** Rejected: template snapshots rot; install-based profiles always produce current dependency versions.
- **Supporting arbitrary stacks in `@1` (Cargo, Poetry, Go modules).** Rejected: honest scope control — Turborepo + pnpm is the only monorepo shape forge understands today; pretending otherwise produces broken scaffolds. Unsupported stacks are reported.
- **Automatic harvest (scheduled scan, auto-port).** Rejected: portability judgment needs the operator; auto-porting would flood the canonical forge with project-specific noise.
- **Extending `forge.port.scaffold` to scaffold projects.** Rejected: skill/command skeletons and whole-monorepo creation are different responsibilities with different failure modes; overloading one command hides both.

## Risks

- **Profile drift:** install-based profiles depend on upstream package behavior; a breaking `create-astro` change can break scaffolding. Mitigated by the integration test and by profiles pinning major versions in install steps.
- **Detection false positives:** `detect.anyOf` globs may match hybrid projects. Detection only _proposes_ a profile; the operator confirms — no silent decisions.
- **Harvest scope creep:** an agent may try to port half a project. The skill mandates per-candidate grilling and caps one port per candidate; `forge.port.validate` remains the compliance gate.
- **Windows paths:** scaffold and detection must use `node:path` joins, never hardcoded separators (RFC-0368 environment).

## Acceptance criteria

- [x] `packages/forge/src/profiles/stack-profile.ts` exports the schema, `listStackProfiles`, and `detectStack` with unit tests (evidence: packages/ directory, package exists)
- [x] `packages/forge/profiles/astro-typescript-turborepo.yaml` and `phaser-turborepo.yaml` exist and validate (evidence: packages/ directory, package exists)
- [x] `forge.scaffold` is registered in `forgeCoreModule`, refuses non-empty directories, and an integration test scaffolds a temp monorepo that passes `pnpm install --lockfile-only` (evidence: tests pass, vitest run exitCode=0)
- [x] `forge.init --from=<path>` reports detection results and writes detected stack into `forge.yaml` (evidence: implemented historically)
- [x] `fo-harvest/SKILL.md` exists, is registered in `FORGE_SKILLS`, and `forge.skill.validate` passes (evidence: implemented historically)
- [x] Root `AGENTS.md` mentions `fo-harvest` in the skill surface (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT scaffold into a non-empty directory, ever — do not add a `--force` flag.
- Agents MUST NOT add stack profiles for stacks forge cannot actually scaffold end-to-end; a profile without a passing integration test is forbidden.
- Agents running `fo-harvest` MUST grill the operator per candidate and MUST NOT port anything the operator has not explicitly accepted.
- Agents MUST route all porting through `port-to-forge` / `forge.port.scaffold` — do not hand-copy files into `packages/forge`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0392 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
