---
rfcId: RFC-0627
planId: PLAN-RFC-0627-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ontology"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/verification-plan.xml
    - docs/development-plan.xml
    - systems/registry.yaml
---

# Implementation Plan: RFC-0627

## 1. Objectives

- [ ] Objective 1 — Add `dev-deployed` state and `channels.dev` to ontology schemas — maps to acceptance criteria 1, 2
- [ ] Objective 2 — Implement `leitstand.deploy` command (deploy + Axiom gate) — maps to acceptance criteria 3, 4, 5, 6
- [ ] Objective 3 — Modify `leitstand.propagate` to require `dev-deployed` + Axiom evidence — maps to acceptance criteria 7, 8
- [ ] Objective 4 — Modify `leitstand.rollback` to auto-detect channel and auto-step — maps to acceptance criteria 9, 10
- [ ] Objective 5 — Update `leitstand.status` and `leitstand.health` for dev channel — maps to rollout step 9
- [ ] Objective 6 — Update registry, DNA, AGENTS.md, Compass XML — maps to acceptance criteria 11, 12
- [ ] Objective 7 — Unit tests for all new and modified commands — maps to acceptance criterion 13

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/release.ts` — add `dev-deployed` to `releaseStateSchema`
- `packages/ontology/src/operations/leitstand.ts` — add `channels.dev` (required), make `channels.alt` required, add `dev` to `lastPropagated`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — new `runLeitstandDeploy`, modified `runLeitstandPropagate`, modified `runLeitstandRollback`, modified `runLeitstandStatus`, modified `runLeitstandHealth`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — register `leitstand.deploy`, update `leitstand.rollback` flags (remove `--channel`), update `leitstand.status`/`leitstand.health` descriptions
- `packages/os/site-kernel-handoff/src/leitstand/index.ts` — export `runLeitstandDeploy`, `LeitstandDeployData`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `Channel` type extended to `"dev" | "alt" | "main"`

### 2.2 Configuration and data

- `systems/registry.yaml` — add `dev` channel for warpgogol-com
- `.env.dev` — create for warpgogol-com (gitignored, operator-managed)

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — update DNA-48 and DNA-49 prose
- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section
- `docs/verification-plan.xml` — update if deployment chain is referenced
- `docs/development-plan.xml` — update if deployment milestones are tracked

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0627`

## 3. Step sequence

### Step 1. Ontology schema changes

**Goal:** Add `dev-deployed` state and `dev` channel to ontology schemas.

**Agent actions:**

- Add `"dev-deployed"` to `releaseStateSchema` enum in `packages/ontology/src/operations/release.ts` (after `"published"`, before `"alt-deployed"`)
- Add `dev: deploymentChannelSchema` (required) to `channels` in `deploymentConfigSchema` in `packages/ontology/src/operations/leitstand.ts`
- Change `channels.alt` from `.optional()` to required
- Add `dev: lastPropagatedChannelSchema.optional()` to `lastPropagated` object
- Update `CHANGE_SUMMARY` in both files with `RFC-0627` entry

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check`

**Completion criterion:** `releaseStateSchema` includes `dev-deployed`; `deploymentConfigSchema` requires `channels.dev`, `channels.alt`, `channels.main`; typecheck passes.

**Human review:** no

---

### Step 2. Extend `Channel` type and helper functions

**Goal:** Update the `Channel` type and channel-related helpers to include `dev`.

**Agent actions:**

- Change `type Channel = "alt" | "main"` to `type Channel = "dev" | "alt" | "main"` in `leitstand-commands.ts`
- Update `parseChannel` to accept `"dev"`
- Update `getChannelConfig` to handle `dev` channel
- Update any channel validation in `leitstand.rollback` to accept `"dev"`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `Channel` type includes `"dev"`; `getChannelConfig` returns dev channel config; typecheck passes.

**Human review:** no

---

### Step 3. Implement `leitstand.deploy` command

**Goal:** New command that deploys to dev channel and runs Axiom verification.

**Agent actions:**

- Implement `runLeitstandDeploy` in `leitstand-commands.ts`:
  - Accept `--release` flag (required)
  - Accept releases in `published` or `dev-deployed` state
  - Read release manifest, get `systemId` and `missionId`
  - Acquire deployment lock
  - Resolve dev channel config from registry
  - Rehydrate dist from artifact store if missing
  - Deploy via `adapter.propagate` with `channel: "dev"`
  - Purge CDN cache (RFC-0624 pattern)
  - Run health check on dev URL
  - Update `lastPropagated.dev` in registry
  - Transition release state to `dev-deployed` on deploy success
  - Invoke `mission.check --external-preview --base-url <dev-url> --mission <missionId> --json` via `executeKernelCommand`
  - Parse mission.check result: if exit code 0, Axiom passed; if 1, Axiom failed (deploy succeeded but gate blocked)
  - Return `LeitstandDeployData` with deploy result + axiom result
  - Append Bordbuch entry
- Define `LeitstandDeployData` interface
- Export `runLeitstandDeploy` and `LeitstandDeployData` from `index.ts`
- Register `leitstand.deploy` in `leitstand.module.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.deploy` command registered; deploys to dev; runs mission.check; transitions to `dev-deployed`; typecheck passes.

**Human review:** no

---

### Step 4. Modify `leitstand.propagate`

**Goal:** Gate propagation on `dev-deployed` state and Axiom evidence.

**Agent actions:**

- Change state check from `published` to `dev-deployed` in `runLeitstandPropagate`
- Update error message: "Release must be in state 'dev-deployed'. Run leitstand.deploy first."
- After state check, add Axiom evidence gate:
  - Read `missions/<missionId>/evidence/axiom/findings.yaml`
  - If file missing, reject: "No Axiom evidence found for mission <id>. Run leitstand.deploy first."
  - Parse `summary.errors`; if > 0, reject: "Axiom verification failed: <N> errors. Fix and re-deploy to dev."
  - Read `recordedAt` from findings.yaml; read `publishedAt` from release manifest; if `recordedAt < publishedAt`, reject: "Axiom evidence is stale (recorded: <date>, published: <date>). Re-run leitstand.deploy for this release."
- Update `LeitstandPropagateData.releaseState` to remain `"alt-deployed"` (unchanged)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.propagate` rejects `published` state; rejects missing/stale/error Axiom evidence; accepts only `dev-deployed` with valid evidence.

**Human review:** no

---

### Step 5. Modify `leitstand.rollback`

**Goal:** Remove `--channel` flag; auto-detect channel from release state; auto-step rollback.

**Agent actions:**

- Remove `--channel` flag from command registration in `leitstand.module.ts`
- In `runLeitstandRollback`:
  - Remove `channel` flag parsing
  - Read release manifest for the current release (from `lastPropagated`)
  - Auto-detect channel from release state: `promoted` → `main`, `alt-deployed` → `alt`, `dev-deployed` → `dev`
  - After rollback succeeds, transition release state one step back: `promoted` → `alt-deployed`, `alt-deployed` → `dev-deployed`, `dev-deployed` → `published`
  - Keep `--to-release` optional flag
  - Update error messages to reflect auto-detection

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.rollback` works without `--channel`; auto-detects channel from state; auto-steps release state one step back.

**Human review:** no

---

### Step 6. Update `leitstand.status` and `leitstand.health`

**Goal:** Support `dev` channel in status and health commands.

**Agent actions:**

- In `runLeitstandStatus`: add `dev` channel to output alongside `alt` and `main`
- In `runLeitstandHealth`: accept `--channel dev|alt|main` (update `parseChannel` call)
- Update command descriptions in `leitstand.module.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.status` shows all three channels; `leitstand.health` accepts `--channel dev`.

**Human review:** no

---

### Step 7. Update registry

**Goal:** Add `dev` channel to warpgogol-com registry entry.

**Agent actions:**

- Add `dev` channel to `systems/registry.yaml` for warpgogol-com:
  ```yaml
  dev:
    workerName: dev-warpgogol-com
    url: https://dev.warpgogol.com
    secretsFile: env:WERKSTATT_SECRETS_DEV
  ```

**Validation:**

- `pnpm exec werkstatt run leitstand.status --system warpgogol-com` (manual, requires runtime)

**Completion criterion:** Registry has `dev`, `alt`, and `main` channels for warpgogol-com.

**Human review:** no

---

### Step 8. Unit tests

**Goal:** Test all new and modified command logic.

**Agent actions:**

- Create `leitstand-0627-deploy.test.ts`:
  - Test: `leitstand.deploy` rejects release not in `published` or `dev-deployed` state
  - Test: `leitstand.deploy` deploys to dev channel and transitions to `dev-deployed`
  - Test: `leitstand.deploy` runs mission.check and reports Axiom result
  - Test: `leitstand.deploy` accepts `dev-deployed` state for re-deploy
- Create `leitstand-0627-propagate-axiom-gate.test.ts`:
  - Test: `leitstand.propagate` rejects `published` state (must be `dev-deployed`)
  - Test: `leitstand.propagate` rejects when Axiom evidence is missing
  - Test: `leitstand.propagate` rejects when `findings.summary.errors > 0`
  - Test: `leitstand.propagate` rejects when evidence is stale (`recordedAt < publishedAt`)
  - Test: `leitstand.propagate` accepts when evidence is fresh and errors === 0
- Create `leitstand-0627-rollback-autostep.test.ts`:
  - Test: rollback from `promoted` → main channel → state becomes `alt-deployed`
  - Test: rollback from `alt-deployed` → alt channel → state becomes `dev-deployed`
  - Test: rollback from `dev-deployed` → dev channel → state becomes `published`
  - Test: `--channel` flag is rejected

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All new tests pass; existing leitstand tests still pass.

**Human review:** no

---

### Step 9. Documentation sync

**Goal:** Update DNA, AGENTS.md, and Compass XML files.

**Agent actions:**

- Update DNA-48 in `docs/architecture-dna.md`: add `dev-deployed` to state machine, mention three-channel model
- Update DNA-49 in `docs/architecture-dna.md`: add `dev` channel, document `leitstand.deploy` and Axiom gate, document auto-step rollback
- Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section: document `dev` channel, `leitstand.deploy`, three-stage chain, auto-step rollback, Axiom evidence freshness check
- Check `docs/verification-plan.xml` for deployment chain references; update if needed
- Check `docs/development-plan.xml` for deployment milestones; update if needed

**Validation:**

- `git diff docs/architecture-dna.md` shows DNA-48 and DNA-49 updates
- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows Leitstand section updates

**Completion criterion:** DNA-48, DNA-49, and AGENTS.md reflect the three-channel model and auto-step rollback.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0627 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0627`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0627`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0627` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Dev secrets write-only problem | Step 7 — `.env.dev` created alongside existing `.env.alt`/`.env.main`; same backup discipline |
| Axiom false positives block deployment | Step 3 — findings written to `findings.yaml` with full details for manual review; pilot scope is `web-accessibility` only |
| Dev deploy + Axiom duration (~2-3 min) | Step 3 — accepted cost of automated verification; no mitigation needed |
| Playwright version mismatch | Step 3 — exit code 4 passed through from `mission.check`; error message documents fix |
| Agent misinterpretation | Step 4 — error message explicitly says "Run leitstand.deploy first"; AGENTS.md updated in Step 9 |
| Schema breaking change | Step 1 — clean slate, only one system exists; registry updated in Step 7 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0627 --reason "..." --invariant "DNA-48"` instead of working around it.
- If `mission.check` cannot be invoked from `leitstand.deploy` due to kernel command execution constraints, escalate to the operator — the Axiom gate depends on this integration.
- If the `Channel` type change from `"alt" | "main"` to `"dev" | "alt" | "main"` causes widespread type errors beyond `leitstand-commands.ts`, audit all consumers and fix forward-only.
