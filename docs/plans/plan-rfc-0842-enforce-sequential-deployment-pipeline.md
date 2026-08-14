---
rfcId: RFC-0842
planId: PLAN-RFC-0842-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - .devin/workflows/deploy.md
    - docs/architecture-dna.md
---

# Implementation Plan: RFC-0842

## 1. Objectives

- [ ] Objective 1 — Generic `--all` guard in `executeKernelCommand` — maps to acceptance criterion "reject `--all` on deployment commands" and operator decision to extend to all `supportsAllSites !== true` commands
- [ ] Objective 2 — Target channel + URL logging in 3 deployment handlers — maps to acceptance criterion "log target channel and URL before execution"
- [ ] Objective 3 — `leitstand.pipeline.check` command — maps to acceptance criterion "create `leitstand.pipeline.check` command"
- [ ] Objective 4 — Update acceptance criteria in RFC to reflect generic guard scope — maps to operator decision "Расширить criteria"
- [ ] Objective 5 — Verify deploy.md and DNA-73 are already satisfied — maps to acceptance criteria "deploy.md updated" and "DNA-73 entry appended"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/kernel/runtime/execute-command.ts` — add `--all` guard after `wsCommand` resolution, before workspace command execution (line ~380–419) and before app-scoped command execution (line ~481+)
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — add `logger.info` target channel + URL logging in `runLeitstandDevDeploy` (line ~724), `runLeitstandPropagate` (line ~1707), `runLeitstandPromote` (line ~2233)
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — add `runLeitstandPipelineCheck` function
- `packages/werkstatt/src/leitstand/leitstand.module.ts` — register `leitstand.pipeline.check` command
- `packages/werkstatt/src/leitstand/index.ts` — export `runLeitstandPipelineCheck` and its data type
- `packages/werkstatt/src/kernel/tests/assert-all-sites-allowed.test.ts` — new unit test for the `--all` guard logic

### 2.2 Configuration and data

- No YAML/JSON/config changes. The `--all` guard reads `supportsAllSites` from existing command definitions.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0842-enforce-sequential-deployment-pipeline.md` — update acceptance criteria to reflect generic guard scope (operator decision)
- `.devin/workflows/deploy.md` — **already updated** (references RFC-0842, `leitstand.pipeline.check`, `--all` warnings). Verify no further changes needed.
- `docs/architecture-dna.md` — **DNA-73 already present** at line 299–301. Verify `dna.registry.validate` passes.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests (if any exist for execute-command or leitstand)
- No new pipeline commands to wire.

## 3. Step sequence

### Step 1. Add `--all` guard in `executeKernelCommand`

**Goal:** Reject `--all` flag for any command where `supportsAllSites !== true` (covers both `false` and `undefined`).

**Agent actions:**

- In `packages/werkstatt/src/kernel/runtime/execute-command.ts`, add a guard function `assertAllSitesAllowed(command: KernelCommandDefinition, allSites: boolean)` that throws when `allSites === true && command.supportsAllSites !== true`.
- Insert the guard call at two points:
  1. **Workspace-scoped path** (after `wsCommand` is resolved at line ~380, before `executeRegisteredCommand` at line ~419): `assertAllSitesAllowed(wsCommand, options.allSites ?? false)`.
  2. **App-scoped path** (after `command` is resolved at line ~495, before `executeRegisteredCommand` at line ~519): `assertAllSitesAllowed(command, options.allSites ?? false)`.
- Error message format: `Command '${commandName}' does not support --all (supportsAllSites is not true). Use --site <siteId> to target a specific site.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors
- Manual reasoning: all 8 leitstand commands with `supportsAllSites: false` will now reject `--all`. Commands with `supportsAllSites: true` (if any exist outside leitstand) remain unaffected. Commands with `supportsAllSites: undefined` will also reject `--all` (safer default per operator decision).

**Completion criterion:** `executeKernelCommand` throws when `allSites === true` and the resolved command has `supportsAllSites !== true`. TypeScript compiles.

**Human review:** no

---

### Step 2. Add target channel + URL logging in deployment handlers

**Goal:** Each deployment command logs its target channel, URL, and worker name before acquiring locks or executing.

**Agent actions:**

- In `runLeitstandDevDeploy` (line ~724, after `channelConfig` is resolved): add `logger.info(\`[leitstand.dev-deploy] Target: channel=dev url=${channelConfig.url} system=${systemId}\`)`.
- In `runLeitstandPropagate` (after `systemId` is resolved from release manifest at line ~1720, before Axiom evidence gate): read system config, resolve alt channel config, add `logger.info(\`[leitstand.propagate] Target: channel=alt url=${altConfig.url} system=${systemId} release=${releaseId}\`)`.
- In `runLeitstandPromote` (after `systemId` is resolved at line ~2215, before `acquireLock` at line ~2218): read system config, resolve main channel config, add `logger.info(\`[leitstand.promote] Target: channel=main url=${mainConfig.url} system=${systemId} release=${releaseId}\`)`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- Logging appears before any lock acquisition or network calls in each handler.

**Completion criterion:** All 3 deployment handlers emit a `logger.info` line with channel, URL, system, and release (where applicable) before executing.

**Human review:** no

---

### Step 3. Implement `leitstand.pipeline.check` command

**Goal:** Read-only command that inspects release pipeline state and reports step completion status + next step.

**Agent actions:**

- In `packages/werkstatt/src/leitstand/leitstand-commands.ts`, add `runLeitstandPipelineCheck` function:
  - Input: `--release <releaseId>` (required)
  - Read `releases/{releaseId}/release.yaml` for release state
  - Read `systems-cache/{systemId}/system-state.yaml` for deployment state
  - Read mission manifest for mission lifecycle state (validate, reconcile, close)
  - Determine pipeline step statuses:
    - `mission.validate` — check mission manifest `validatedAt`
    - `mission.reconcile` — check mission manifest `reconciledAt`
    - `mission.close` — check mission manifest `state === "closed"`
    - `release.prepare` — check release manifest `state` is `prepared` or later
    - `release.ready` — check release manifest `state` is `ready` or later
    - `leitstand.dev-deploy` — check release manifest `state` is `dev-deployed` or later
    - `leitstand.propagate` — check release manifest `state` is `alt-deployed` or later
    - `leitstand.promote` — check release manifest `state` is `main-deployed` or `promoted`
  - Determine `nextStep` based on current release state (exhaustive):
    - `prepared` → next: `release.ready`
    - `ready` → next: `leitstand.dev-deploy`
    - `dev-deployed` → next: `leitstand.propagate`
    - `alt-deployed` → next: `leitstand.promote`
    - `main-deployed` / `promoted` → next: `mission.archive`
    - `rolled-back` → next: `release.prepare` (release was rolled back, needs re-prepare)
    - `missing` / unknown → next: `release.prepare`
  - Return `KernelCommandResult` with `data: { releaseId, systemId, releaseState, steps: [{name, status}], nextStep }`
  - `exitCode: 0` always (read-only, informational)
- In `packages/werkstatt/src/leitstand/leitstand.module.ts`, register:
  ```
  registry.registerCommand({
    name: "leitstand.pipeline.check",
    description: "Inspect deployment pipeline state for a release (RFC-0842). Flags: --release.",
    scope: "workspace",
    supportsAllSites: false,
    flags: {
      release: { kind: "string", required: true, description: "Release id to inspect." },
    },
    reads: [
      "releases/{release}/**",
      "systems-cache/{system}/system-config.yaml",
      "systems-cache/{system}/system-state.yaml",
    ],
    cacheable: false,
    execute: runLeitstandPipelineCheck,
  });
  ```
- In `packages/werkstatt/src/leitstand/index.ts`, export `runLeitstandPipelineCheck` and `LeitstandPipelineCheckData` type.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- Command is registered and discoverable via `pnpm exec werkstatt run leitstand.pipeline.check --help`

**Completion criterion:** `leitstand.pipeline.check --release <id>` returns a structured JSON with step statuses and next step. TypeScript compiles. Command is registered in the module.

**Human review:** no

---

### Step 3.5. Unit test for `assertAllSitesAllowed` guard

**Goal:** Verify the `--all` guard logic in isolation, covering all three `supportsAllSites` states.

**Agent actions:**

- Create `packages/werkstatt/src/kernel/tests/assert-all-sites-allowed.test.ts` with 3 test cases:
  1. `supportsAllSites: true` + `allSites: true` → does not throw (pass)
  2. `supportsAllSites: false` + `allSites: true` → throws with expected error message
  3. `supportsAllSites: undefined` + `allSites: true` → throws (the `!== true` check catches `undefined`)
  4. `supportsAllSites: false` + `allSites: false` → does not throw (guard inactive when `--all` not set)
- Import `assertAllSitesAllowed` from `execute-command.ts` (export it or test via the exported function if not directly exported — if not exported, test through `executeKernelCommand` with a mock command).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all 4 tests pass

**Completion criterion:** Unit test file exists with 4 test cases covering `true`, `false`, `undefined`, and inactive-guard scenarios. All tests pass.

**Human review:** no

---

### Step 4. Update RFC acceptance criteria for generic guard scope

**Goal:** Reflect the operator's decision to extend the `--all` guard to all commands with `supportsAllSites !== true`, not just the 3 deployment commands.

**Agent actions:**

- In `docs/rfcs/rfc-0842-enforce-sequential-deployment-pipeline.md`, update the acceptance criteria section:
  - Add a criterion: "Generic `--all` guard in `executeKernelCommand` rejects `--all` for any command where `supportsAllSites !== true` (including `undefined`)"
  - Keep existing criteria about the 3 deployment commands as specific instances
- Commit via `ecosystem.commit`.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0842 --json` — passes with updated criteria

**Completion criterion:** RFC acceptance criteria include the generic guard criterion. `rfc.validate` passes.

**Human review:** no

---

### Step 5. Verify pre-met acceptance criteria (deploy.md, DNA-73)

**Goal:** Confirm that deploy.md and DNA-73 are already satisfied and mark them as pre-met.

**Agent actions:**

- Verify `.devin/workflows/deploy.md` contains:
  - `leitstand.pipeline.check` reference (line 121 — already present)
  - `--all` forbidden warnings (lines 59, 134, 152, 171, 186 — already present)
  - State transition diagram (lines 13–53 — already present)
  - Exact command syntax for each step (already present)
- Verify `docs/architecture-dna.md` contains DNA-73 entry at line 299–301.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0842 --json` to confirm no violations.
- No file changes needed — just verification and marking criteria as pre-met during stamping.

**Validation:**

- `grep -c "RFC-0842" .devin/workflows/deploy.md` — returns ≥5
- `grep -c "leitstand.pipeline.check" .devin/workflows/deploy.md` — returns ≥1
- `grep "DNA-73" docs/architecture-dna.md` — returns the entry

**Completion criterion:** deploy.md and DNA-73 confirmed present. No changes needed.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files if any new agent-facing rules are introduced (likely none — the guard is internal to `executeKernelCommand`).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (new `leitstand.pipeline.check` command added).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For pre-met criteria (deploy.md, DNA-73), mark `[x]` with `(evidence: pre-existing)`.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0842 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0842`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0842`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test` (if tests exist for execute-command or leitstand)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0842` (RFC-0330, for probe-bearing RFCs)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0842.generated.json` — verification evidence (if acceptance probes are declared)
- Commit messages referencing `RFC-0842` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `supportsAllSites: undefined` commands silently accept `--all` | Step 1 uses `!== true` check, catching both `false` and `undefined` (operator decision) |
| Guard placement wrong for workspace-scoped commands | Step 1 inserts guard at both workspace and app-scoped paths, after command resolution |
| `leitstand.pipeline.check` incomplete state coverage | Step 3 handles all release states: `prepared`, `ready`, `dev-deployed`, `alt-deployed`, `main-deployed`, `promoted`, `rolled-back`, `missing` |
| False positives from generic guard on non-deployment commands | All 8 leitstand commands already have `supportsAllSites: false` — no behavior change for them. Other modules' commands with `undefined` will now reject `--all`, which is safer. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-73, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0842 --reason "..." --invariant "DNA-73"` instead of working around it.
- If the `--all` guard breaks existing CI workflows that rely on `--all` for non-deployment commands, investigate whether those commands should set `supportsAllSites: true` instead of removing the guard.
