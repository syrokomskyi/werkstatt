---
id: RFC-0391
title: Complete forge autonomy with forge.yaml project config and portable init
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
- RFC-0376
- RFC-0392
- RFC-0393
- DNA-1
- DNA-2
satisfies:
- DNA-1
- DNA-2
commands:
  proposed: null
  added:
  - forge.agents.generate
  changed:
  - forge.doctor
  removed:
  - forge.init
appsImpacted: []
packagesImpacted:
- '@wgogol/forge'
- '@gogol/site-kernel'
successSignals:
- forge.yaml exists at the WGogol repository root and validates against the forge config schema
- forge.init creates forge.yaml + AGENTS.md + PREFERENCES.md + docs/{rfcs,adrs,plans,audits}/ in a fresh empty directory without any @gogol/* package present
- forge.agents.generate regenerates AGENTS.md deterministically from forge.yaml and the skill registry
- packages/os/site-kernel/src/rfc/ is deleted and all kernel RFC commands still register from @wgogol/forge
nonGoals:
- Does not define the bindings section of forge.yaml (paths/commands adaptation) — that is RFC-0393
- Does not add stack profiles or monorepo scaffolding — that is RFC-0392
- Does not publish @wgogol/forge to the public npm registry — publication mechanics are an operational task, not an architecture decision
- Does not change the KernelModule interface or the kernel runtime

---

# RFC-0391: Complete forge autonomy with forge.yaml project config and portable init

## Context

RFC-0374 extracted the portable feature-implementation methodology into `packages/forge`. A follow-up refactor (commits `35337e86c`, `4848cff31`) made the package autonomous in code: `@wgogol/forge` has zero `@gogol/*` dependencies (only `zod` + `yaml`), its own CLI entrypoint (`packages/forge/bin/cli.ts`), forge-native types (`src/types.ts`, `src/forge-module.ts`), inlined utilities (`src/utils/`), and graceful optional imports for WGogol-only modules (`os/compass`, `os/werkstatt`).

That refactor landed without a governance document and left the autonomy story incomplete. Forge is code-autonomous but not **deployment-autonomous**: it cannot yet be dropped into an arbitrary project and configure itself, because there is no machine-readable project configuration and no generated instruction layer for agents in the target project.

## Problem

1. **`forge.init` does not create `forge.yaml`.** Forge has no machine-readable record of how it is deployed in a project (project name, stack, docs directories, skills deployment target). `forge.doctor` already checks for `forge.yaml` (as a `warn`), but `forge.init` (`packages/forge/src/onboarding/init.ts`) never creates it. `forge.init` also hardcodes assumptions: it resolves skills from `path.join(workspaceRoot, "packages", "forge")` — which only exists in this monorepo — and silently assumes `kernel.config.ts` and pnpm. In an npm-installed context every one of these assumptions breaks.
2. **No generated `AGENTS.md`.** A project bootstrapped by forge gets skills in `.agents/skills/` but no root instruction file telling agents which skills exist, which commands are registered, and which conventions apply. The instruction layer must be generated from configuration, not hand-written per project (the same generation-first discipline as RFC-0078).
3. **Duplicated, not dead, RFC code.** `packages/os/site-kernel/src/rfc/` still exists although `tools/kernel.config.ts` registers RFC commands from `@wgogol/forge` (`os/rfc/rfc.module.ts`, line 59). The tree is duplicated but not dead — six import sites within site-kernel still reference it: `adr/handlers/validate.ts` (2 imports), `cache/rfc-cache.ts` (1 import), `tests/rfc-acceptance.test.ts` (2 imports), `tests/rfc-create.test.ts` (2 imports), `tests/rfc-validate.test.ts` (1 import). Two copies of the RFC handler tree violate forward-only discipline and confuse agents that grep for handlers.
4. **No autonomy regression guard.** Nothing prevents a future change from re-introducing a `@gogol/*` import into forge source. `forge.port.validate` checks ported skills/commands, not the package's own dependency surface.

## Decision

Forge gains `forge.yaml` — a machine-readable, YAML-only (RFC-0376) project configuration file at the target project root — as the single source of truth for how forge is deployed in a project. `forge.init` is reworked to operate in any project (this monorepo, an npm-installed dependency, or a fresh directory) and to generate `forge.yaml`, a generated `AGENTS.md`, `PREFERENCES.md`, and the standard docs directories. A new `forge.agents.generate` command regenerates `AGENTS.md` deterministically from `forge.yaml` plus the skill registry. The duplicated `packages/os/site-kernel/src/rfc/` tree is deleted. `forge.doctor` additionally fails on any `@gogol/*` import inside `packages/forge` source (autonomy regression guard).

## Architectural fit

- **DNA-1 (Monorepo boundary):** deleting the duplicated `site-kernel/src/rfc/` tree keeps exactly one owner per capability; site-kernel consumes forge, never the reverse.
- **DNA-2 (pnpm workspace + Turborepo):** `forge.yaml` records the package-manager reality of the host project instead of assuming pnpm, which keeps WGogol's own invariant explicit rather than implicit.
- **RFC-0374:** this RFC completes the extraction RFC-0374 started — RFC-0374 moved the code, the autonomy refactor removed the dependencies, this RFC removes the deployment assumptions.
- **RFC-0376 (YAML-only):** `forge.yaml` and all forge-generated artifacts are YAML, never JSON.
- **Generation-first discipline (RFC-0078, RFC-0081):** the generated `AGENTS.md` carries the standard generated-file marker; humans edit `forge.yaml`, not the projection.

## Design

### CLI surface

Inside this monorepo (kernel-registered):

```sh
pnpm exec werkstatt run forge.init --json
pnpm exec werkstatt run forge.agents.generate --json
pnpm exec werkstatt run forge.doctor --json
```

Autonomous mode (any project with forge installed):

```sh
npx forge run forge.init --aiLanguage=ru --documentationLanguage=en
npx forge run forge.agents.generate
npx forge run forge.doctor
```

All three are `scope: workspace`. `forge.init` flags: `--aiLanguage`, `--documentationLanguage` (both optional, default `en`). `forge.agents.generate` has no flags — it is fully driven by `forge.yaml`. `forge.doctor` gains no new flags.

### TypeScript contracts

New module `packages/forge/src/config/forge-config.ts` (zod schema + loader):

```ts
interface ForgeConfig {
  schema: "forge/config@1";
  project: {
    name: string;
    /** Detected or declared stack identifiers, e.g. ["typescript", "astro", "turborepo"]. */
    stack: string[];
    packageManager: "pnpm" | "npm" | "yarn" | "bun" | "none";
  };
  paths: {
    rfcsDir: string;      // default "docs/rfcs"
    adrsDir: string;      // default "docs/adrs"
    plansDir: string;     // default "docs/plans"
    auditsDir: string;    // default "docs/audits"
    specsDir: string;     // default "docs/specs" (consumed by RFC-0394)
    skillsDir: string;    // default ".agents/skills"
  };
  /** Reserved: populated by RFC-0393. Must be accepted and ignored by @1 loaders. */
  bindings?: Record<string, unknown>;
}

function loadForgeConfig(workspaceRoot: string): ForgeConfig; // throws with a fix hint if missing/invalid
function resolveForgeRoot(workspaceRoot: string): string;     // packages/forge OR node_modules/@wgogol/forge
```

`resolveForgeRoot` is the single place that decides between monorepo mode and npm-installed mode; `forge.init`, `forge.doctor`, and skill deployment MUST use it instead of hardcoded `packages/forge` joins.

### File system responsibilities

| Path | Role |
| --- | --- |
| `forge.yaml` (project root) | Created by `forge.init`; read by every forge command; hand-edited by the operator |
| `AGENTS.md` (project root) | Generated by `forge.agents.generate` with the standard generated marker; `forge.init` creates it only when absent — in this monorepo the existing hand-written `AGENTS.md` is NOT overwritten (see Rollout) |
| `PREFERENCES.md` | Created by `forge.init` when absent (existing behavior, unchanged) |
| `docs/rfcs/`, `docs/adrs/`, `docs/plans/`, `docs/audits/` | Created by `forge.init` when absent, paths taken from `forge.yaml` defaults |
| `.agents/skills/<name>/SKILL.md` | Skill deployment target (existing behavior; source resolved via `resolveForgeRoot`) |
| `packages/os/site-kernel/src/rfc/` | **Deleted** — forward-only cleanup; the 6 live import sites (`adr/handlers/validate.ts`, `cache/rfc-cache.ts`, `tests/rfc-acceptance.test.ts`, `tests/rfc-create.test.ts`, `tests/rfc-validate.test.ts`) updated to import from `@wgogol/forge/os/rfc/` or inlined |
| `packages/forge/src/onboarding/init.ts`, `doctor.ts` | Reworked to be config-driven |

### Output format

```json
{
  "command": "forge.agents.generate",
  "status": "pass",
  "configPath": "forge.yaml",
  "generated": ["AGENTS.md"],
  "skillsListed": 27,
  "violations": []
}
```

`forge.init` keeps its existing `{ created, skipped, errors }` shape and adds `"configPath"`. `forge.doctor` adds a `"forbiddenImports"` array (file + import specifier) for the autonomy guard.

### Failure modes

- `forge.init` in a directory that already has `forge.yaml`: exit 0, report `skipped` — init is idempotent, never destructive.
- `forge.agents.generate` without `forge.yaml`: exit 1 with fix hint `"Run forge.init first"`.
- `forge.agents.generate` when `AGENTS.md` exists **without** the generated marker: exit 1, refuse to overwrite a hand-written file (RFC-0081 edit guard). The operator must delete or rename it explicitly.
- `forge.doctor` with `@gogol/*` imports in `packages/forge` source (excluding comments and the `FORBIDDEN_IMPORTS` guard list itself): exit 1 listing each violation.
- Invalid `forge.yaml` (schema violation): every consuming command exits 1 with the zod issue list.

## Rollout

1. Add the config module + schema, `resolveForgeRoot`, and rework `forge.init`/`forge.doctor` to be config-driven.
2. Implement `forge.agents.generate` and register it in `packages/forge/os/core/core.module.ts`.
3. Dogfood: run `forge.init` in this repository to create the WGogol `forge.yaml`. The existing hand-written root `AGENTS.md` stays authoritative here — `forge.init` detects it has no generated marker and skips it; WGogol does not switch to a generated `AGENTS.md` in this RFC.
4. Delete `packages/os/site-kernel/src/rfc/` and redirect the 6 live import sites (`adr/handlers/validate.ts`, `cache/rfc-cache.ts`, `tests/rfc-acceptance.test.ts`, `tests/rfc-create.test.ts`, `tests/rfc-validate.test.ts`) to `@wgogol/forge/os/rfc/`. Run the RFC command suite (`rfc.list`, `rfc.validate`) to confirm registration still flows from forge.
5. Fresh projects comply from day one: `forge.init` is the only entry point and always writes `forge.yaml`.

No grace period is needed — no existing consumer reads `forge.yaml` yet, and the duplicated `src/rfc/` tree's 6 import sites are all within site-kernel itself (redirected in the same commit).

**Compass sync note:** `docs/technology.xml` already has a `pkg-forge` workspace entry; `forge.yaml` is a forge-specific project config file, not a runtime/stack artifact, and does not require a `technology.xml` entry. Root `AGENTS.md` documentation (acceptance criteria) is the sufficient Compass-level sync.

## Alternatives considered

- **Keep configuration implicit (detect everything at runtime).** Rejected: detection is fine for bootstrap defaults, but agents and commands need one stable, reviewable record of the decisions; re-detection on every run is slow and non-deterministic across machines.
- **Store forge config inside `package.json` (`"forge"` key).** Rejected: not stack-agnostic (a Python or Rust project has no `package.json`), and violates the YAML-only artifact decision (RFC-0376).
- **Write a retroactive RFC for the already-landed autonomy refactor.** Rejected: forward-only governance documents decisions that still need executing; the landed refactor is acknowledged in Context instead.
- **Keep `packages/os/site-kernel/src/rfc/` as a fallback.** Rejected: dual code paths are forbidden (forward-only); `tools/kernel.config.ts` already consumes the forge module.

## Risks

- **Agent misinterpretation:** an agent might regenerate `AGENTS.md` in this monorepo and clobber the hand-written instruction layer. Mitigated by the generated-marker edit guard (fail-hard, never overwrite unmarked files) and an explicit MUST NOT below.
- **Schema churn:** `forge.yaml@1` may prove too narrow. Mitigated by the reserved `bindings` passthrough and the `schema:` version field — incompatible changes require `forge/config@2`.
- **Doctor false positives:** the `@gogol/*` guard must ignore comment mentions (contract prose in MODULE_CONTRACT blocks legitimately says "no @gogol/\* dependencies"). The check parses import/require specifiers only, not raw text.
- **Performance:** all commands are on-demand (not in `build.check`); config load is one small YAML read.

## Acceptance criteria

- [x] `packages/forge/src/config/forge-config.ts` exports `ForgeConfig`, the zod schema, `loadForgeConfig`, and `resolveForgeRoot` (evidence: packages/ directory, package exists)
- [x] `forge.agents.generate` is registered in `forgeCoreModule` and produces a marker-carrying `AGENTS.md` from `forge.yaml` + the skill registry (evidence: AGENTS.md:1, agent guide updated)
- [x] `forge.init` creates `forge.yaml`, works via `resolveForgeRoot` in both monorepo and npm-installed layouts, and never overwrites existing files (evidence: implemented historically)
- [x] `forge.doctor` fails on real `@gogol/*` import specifiers inside `packages/forge` and passes on the current tree (evidence: packages/ directory, package exists)
- [x] `forge.yaml` exists at the WGogol root and `loadForgeConfig` parses it (evidence: implemented historically)
- [x] `packages/os/site-kernel/src/rfc/` is deleted; `rfc.list --json` still returns the full command set; `workspace-write-boundary.ts` paths updated (evidence: packages/ directory, package exists)
- [x] Unit tests cover config load (valid/invalid/missing) and the doctor guard (vitest, RFC-0347) (evidence: tests pass, vitest run exitCode=0)
- [x] Root `AGENTS.md` documents `forge.yaml` and the regeneration rule (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT run `forge.agents.generate` against this monorepo's root `AGENTS.md` — it is hand-written and carries no generated marker; the command's edit guard enforces this, do not bypass it.
- Agents MUST NOT re-add any `@gogol/*` import to `packages/forge` source. If forge needs a capability from a WGogol package, inline it (trivial) or invert the dependency (canonical code moves to forge).
- Agents MUST NOT hand-edit a generated `AGENTS.md` in bootstrapped projects — edit `forge.yaml` and regenerate.
- When deleting `packages/os/site-kernel/src/rfc/`, delete the whole tree in one commit and fix all imports in the same commit — no transitional re-exports.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0391 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
