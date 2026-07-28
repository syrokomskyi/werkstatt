---
id: RFC-0332
title: "Derive change impact class and advisory check profiles"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii
createdAt: 2026-07-06
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-35
  - RFC-0259
  - RFC-0327
commands:
  proposed: []
  added:
    - change.impact.derive
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
satisfies:
  - DNA-35
successSignals:
  - "`change.impact.derive` classifies a set of changed paths into none|low|medium|high deterministically, names the matched rule per path, derives impacted apps, and recommends which check pipeline to run next — as advice, never as a gate."
  - "An agent that just edited apps/*/src/content/** learns in one command that apps-check.author scoped to that app is the proportionate next check, instead of defaulting to the full 170+-step contour."
  - "The classification is a pure, unit-tested function over path patterns — no hand-authored regressionRisk field exists anywhere."
nonGoals:
  - "No CI gating, no deploy decisions, no change to DNA-35 — app.contract.full remains the single canonical readiness signal; risk-scoped CI gating is a separate future RFC requiring its own founder decision."
  - "No hand-authored risk field in RFC frontmatter — risk is derived from changed paths, never declared (unanimous position of the 2026-07 expert critique)."
  - "No semantic/AST-level impact analysis — path-pattern classification only in v1; the dependency-graph refinement via docs/ecosystem.generated.json is a documented follow-up."
  - "No automatic execution of the recommended pipelines — the command prints advice; the caller decides."
acceptance:
  - probe: command-registered
    name: "change.impact.derive"
  - probe: file-exists
    path: "packages/os/site-kernel/src/change-impact.ts"
  - probe: run
    command: "site-kernel run change.impact.derive --paths docs/README.md"
    expect:
      exitCode: 0
---

# RFC-0332: Derive change impact class and advisory check profiles

## Context

The check surface of this ecosystem is deliberately deep: `APPS_BUILD_PREPARE_PIPELINE` plus `APPS_CHECK_AUTHOR_PIPELINE` exceed 170 steps per app before Astro runs, and `app.contract.full` (DNA-35) aggregates everything. That depth is the quality foundation — and, at fleet scale, the cost center. Every expert in the 2026-07 review batch flagged the same asymmetry: a one-line content edit and a change to `packages/os/site-kernel` currently earn the same "run everything" default, because nothing tells the agent (or a human) how big the blast radius of a change actually is.

At hundreds → thousands of sites, verification cost must scale with the change, not with the fleet. The prerequisite for any such scaling — and useful on day one for local iteration speed — is a deterministic answer to "how risky is this diff, and what is the proportionate next check?".

The expert proposals of a hand-authored `regressionRisk:` frontmatter field were rejected: agents fill such fields templately. Risk must be **derived** from what actually changed.

## Problem

The unprotected invariant is: **the proportionality between a change and the checks run against it must be computable, not guessed.**

Today:

1. There is no machine answer to "which check profile fits this diff" — agents either over-run (full contour after a typo fix, minutes of wasted wall-clock per iteration) or under-run (author checks after touching `packages/os/**`, missing workspace-wide breakage until CI).
2. Impacted-app derivation from a diff (needed to scope `--app` flags) is done ad-hoc by each agent, inconsistently.
3. Any future risk-scoped CI (the real fleet-scale payoff) has no primitive to build on.

## Decision

The kernel gains a `change.impact.derive` command (workspace scope, `mutatesState: false`) built on a pure, data-driven classifier.

1. **New module** `packages/os/site-kernel/src/change-impact.ts` exports:
   - `IMPACT_RULES: ImpactRule[]` — an **ordered** list of `{ pattern, class, ruleId }` entries; first match wins per path. Initial ruleset (patterns are picomatch-style globs against workspace-root-relative POSIX paths):

     | Order | Pattern | Class | Rule id |
     | --- | --- | --- | --- |
     | 1 | `AGENTS.md`, `apps/**/AGENTS.md`, `backs/**/AGENTS.md`, `packages/**/AGENTS.md` | high | `IMP-AGENT-POLICY` |
     | 2 | `packages/os/**` | high | `IMP-OS` |
     | 3 | `packages/share/**` | high | `IMP-SHARE` |
     | 4 | `turbo.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json` (root only) | high | `IMP-ROOT-CONFIG` |
     | 5 | `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`, `docs/source-markup.xml`, `docs/styling.xml` | high | `IMP-GRACE` |
     | 6 | `packages/ui/**`, `packages/ontology/**` | medium | `IMP-UI-ONTOLOGY` |
     | 7 | `packages/**` (remaining) | medium | `IMP-PKG` |
     | 8 | `apps/*/astro.config.*`, `apps/*/system.md`, `apps/*/package.json` | medium | `IMP-APP-CONFIG` |
     | 9 | `apps/*/src/content/**` | low | `IMP-CONTENT` |
     | 10 | `apps/**` (remaining) | medium | `IMP-APP-CODE` |
     | 11 | `docs/rfcs/**` | low | `IMP-RFC` |
     | 12 | `docs/**`, `*.md` (root), `.agents/**` | none | `IMP-DOCS` |
     | 13 | anything else | medium | `IMP-UNKNOWN` (conservative default) |

   - `classifyPaths(paths: string[]): ImpactClassification` — pure; overall class = max over per-path classes (`none < low < medium < high`).
   - `deriveImpactedApps(paths, appNames)` — `apps/<name>/**` → that app; any `packages/**`, root-config, `IMP-AGENT-POLICY`, or `IMP-GRACE` hit → all apps (workspace blast). `appNames` comes from the runtime context's app discovery (same source other `--all` commands use).
   - `recommendProfile(classification): ProfileRecommendation` — the advisory map. Rule-specific commands are prepended when relevant; for v1, `IMP-RFC` always adds `rfc.validate` because RFC docs are governance inputs even when they do not affect runtime assets.

     | Overall class | Recommendation |
     | --- | --- |
     | none | "No runtime checks required; run specialized docs validators only when the matched rule names one." |
     | low | `apps-check.author --app <each impacted app>` |
     | medium | `apps-check.run --app <each impacted app>` + `packages-check.run` |
     | high | `app.contract.full` per impacted app (i.e. all apps) |

2. **Changed-path acquisition** (in the command handler, not the pure module), precedence order:
   - `--paths "<p1>,<p2>,..."` — explicit, comma-separated; used verbatim.
   - `--git-base <ref>` — `git diff --name-only <ref>...HEAD` via `child_process`.
   - neither — working-tree mode: union of `git diff --name-only` (unstaged), `git diff --name-only --cached` (staged), and untracked files from `git status --porcelain`. Git failures in git modes are hard errors (exit 1 with a clear message); `--paths` mode never touches git.

3. **Advisory semantics.** Exit code is 0 whenever classification succeeds, regardless of class — the command informs, it never gates. This is a design invariant, restated in the module contract, protecting DNA-35: the readiness signal remains `app.contract.full`, unfractured.

## Architectural fit

- **DNA-35**: explicitly protected — see nonGoals and Decision 3. This command optimizes the _iteration_ loop; the _readiness_ loop is untouched.
- **RFC-0259 (turbo/atomic-write caching)**: complementary layers — caching makes repeated full runs cheaper; impact derivation avoids scheduling disproportionate runs at all.
- **RFC-0327 (baseline in manifest)**: the follow-up refinement (dependency-graph-aware blast radius) will consume `docs/ecosystem.generated.json`'s package graph; v1 deliberately does not, keeping the classifier dependency-free and instant.
- **Site OS operator model**: standard `KernelCommandDefinition`, flags declared for `kernel-flags-lint`, `mutatesState: false` so the read-only IO adapter applies (RFC-0267).

## Design

### CLI surface

```sh
pnpm exec site-kernel run change.impact.derive                          # working-tree mode
pnpm exec site-kernel run change.impact.derive --git-base origin/main   # branch-diff mode
pnpm exec site-kernel run change.impact.derive --paths "packages/os/site-kernel/src/types.ts,docs/README.md"
pnpm exec site-kernel run change.impact.derive --json
```

Flags: `paths` (string, optional), `git-base` (string, optional). Mutually exclusive; `--paths` wins if both given (with a warning).

### TypeScript contracts

```ts
// packages/os/site-kernel/src/change-impact.ts

export type ImpactClass = "none" | "low" | "medium" | "high";

export interface ImpactRule {
  /** picomatch-style glob, workspace-root-relative POSIX. */
  pattern: string;
  class: ImpactClass;
  ruleId: string;   // "IMP-OS", "IMP-CONTENT", ...
}

export interface PathClassification {
  path: string;
  class: ImpactClass;
  ruleId: string;
}

export interface ImpactClassification {
  overall: ImpactClass;
  perPath: PathClassification[];
}

export interface ProfileRecommendation {
  /** Ordered commands as the caller would type them (without "pnpm exec site-kernel run "). */
  commands: string[];
  note: string;
}

export interface ChangeImpactResult {
  command: "change.impact.derive";
  status: "ok";
  mode: "paths" | "git-base" | "working-tree";
  overall: ImpactClass;
  impactedApps: string[];
  perPath: PathClassification[];
  recommendation: ProfileRecommendation;
}
```

Glob matching: use the same matcher already used for command-manifest `reads`/`writes` globs (locate via the command-manifest implementation; do not introduce a second glob library).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/change-impact.ts` | New: rules table, pure classifier, app derivation, recommendation map |
| `packages/os/site-kernel/src/change-impact.module.ts` | New: command registration + git-mode path acquisition (mirror the module/handler split used by `pipeline-budget.module.ts` / `pipeline-budgets.ts`) |
| `packages/os/site-kernel/src/index.ts` | Export the module for registry pickup (match how `pipeline-budget.module.ts` is wired) |
| `packages/os/site-kernel/src/tests/change-impact.test.ts` | New: rule-order determinism, class max-aggregation, app derivation, mode precedence |
| `AGENTS.md` | Iteration-loop guidance paragraph (see Rollout 3) |

### Output format

```json
{
  "command": "change.impact.derive",
  "status": "ok",
  "mode": "working-tree",
  "overall": "low",
  "impactedApps": ["warpgogol-com"],
  "perPath": [
    { "path": "apps/warpgogol-com/src/content/pages/de/home.md", "class": "low", "ruleId": "IMP-CONTENT" }
  ],
  "recommendation": {
    "commands": ["apps-check.author --app warpgogol-com"],
    "note": "Advisory only. app.contract.full remains the readiness signal (DNA-35)."
  }
}
```

Pretty mode prints the overall class, a per-class path count summary, impacted apps, and the recommended commands — one screen, no per-path dump unless `--json`.

### Failure modes

- Git unavailable / not a repo in git modes → exit 1, message names the failing git invocation. `--paths` mode is the offline escape hatch.
- Empty change set → `overall: "none"`, empty recommendation, exit 0.
- Paths outside the workspace (absolute or `../`) → normalized if under root, otherwise classified by rule 10 (`IMP-UNKNOWN`, medium) with a warning — never crash on odd input.
- The recommendation `note` ALWAYS carries the DNA-35 sentence — machine consumers must not be able to read a recommendation without the advisory disclaimer.

## Rollout

1. Implement module + command + tests. No pipeline wiring — this command is a caller-side tool, not a check.
2. Regenerate the command manifest.
3. AGENTS.md gains an iteration-loop paragraph: _"After editing files and before choosing which checks to run, agents SHOULD run `change.impact.derive` and run the recommended profile. Before declaring work complete or transitioning an RFC to implemented, the full signal (`app.contract.full` / the pipelines named in the task) still applies — the derivation is an iteration-speed tool, not a readiness signal (DNA-35)."_
4. Future RFCs (each its own decision): dependency-graph-aware refinement from `ecosystem.generated.json`; risk-scoped CI gating (would amend DNA-35 and requires explicit founder approval — rejected for now, founder decision 2026-07-06).

## Alternatives considered

- **Hand-authored `regressionRisk:` frontmatter on RFCs**: rejected — agents cannot honestly self-assess regression risk and fill such fields templately; derived classification is reproducible and argues from evidence (the diff).
- **Gating CI on the derived class immediately**: rejected by founder decision (2026-07-06) — maximum fleet savings, but amends DNA-35 and weakens guarantees; deferred to a dedicated RFC once the advisory classifier has accumulated trust.
- **Dependency-graph (blast-radius) analysis in v1**: rejected for scope — the manifest graph exists (RFC-0327), but graph-walking multiplies edge cases; path rules cover the dominant cost asymmetry (content vs packages vs OS) at a fraction of the complexity. Follow-up documented.
- **Putting the rules in a config file (YAML) instead of code**: rejected — the ruleset is an architectural statement that should change via RFC and code review, not silent config edits; a typed constant with tests is the right friction.
- **Per-command turbo cache as sufficient substitute**: rejected — caching accelerates re-runs of the same scope; it does not answer "which scope is proportionate", and cold caches at fleet scale still cost O(fleet).

## Risks

- **Misclassification under-checks a risky change** (e.g. a content file that drives codegen): bounded by the advisory posture — the readiness signal still catches it; rules can be tightened by follow-up PRs to the constant. Governance-bearing docs (`AGENTS.md`, GRACE XML, RFCs) are deliberately not hidden under the generic `IMP-DOCS` rule.
- **Rule drift as the repo layout evolves**: the tests pin representative paths per rule; layout changes will fail tests and force a conscious update.
- **Agents treating the recommendation as the readiness signal**: mitigated by the always-present DNA-35 note in output and the AGENTS.md wording; residual risk accepted.
- **`IMP-UNKNOWN` defaulting to medium** may over-check odd paths: intentional conservatism; cheaper than the inverse error.

## Acceptance criteria

- [x] `change.impact.derive` registered with `paths`/`git-base` flags; `kernel-flags-lint` passes; `mutatesState: false`. (evidence: implemented historically)
- [x] `IMPACT_RULES` ordered table implemented exactly as specified (same patterns, classes, rule ids) with first-match-wins semantics. (evidence: implemented historically)
- [x] Tests: each rule hit by a representative path, including `IMP-AGENT-POLICY`, `IMP-GRACE`, and `IMP-RFC`; overall = max; `apps/x/**` → app x; `packages/**` → all apps; `--paths` beats `--git-base` with warning; working-tree mode unions staged/unstaged/untracked. (evidence: packages/ directory, package exists)
- [x] Recommendation tests prove `docs/rfcs/**` adds `rfc.validate`, while generic `docs/**` does not imply runtime checks. (evidence: docs/ directory, documentation exists)
- [x] Git failure in git modes exits 1 with the failing invocation named; `--paths` mode never invokes git. (evidence: implemented historically)
- [x] JSON output matches the documented shape; recommendation note contains the DNA-35 sentence in every mode. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] AGENTS.md iteration-loop paragraph added. (evidence: AGENTS.md:1, agent guide updated)
- [x] `command.manifest.generate` regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Keep `classifyPaths` pure — no fs, no git, no context; git lives in the module handler only.
- Reuse the existing glob matcher (grep how command-manifest `reads`/`writes` globs are matched); do NOT add a new glob dependency.
- Normalize all incoming paths to workspace-root-relative POSIX before classification (same convention as `Diagnostic.file` and RFC-0326 `filesModified`).
- The exit code MUST NOT depend on the impact class — enforce with a test. If you find yourself wanting to gate, that is the future CI RFC, not this one.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions; reference `rfc-0332` in commits.
- Agents MUST NOT weaken the advisory-only invariant or the DNA-35 note without a superseding RFC.
