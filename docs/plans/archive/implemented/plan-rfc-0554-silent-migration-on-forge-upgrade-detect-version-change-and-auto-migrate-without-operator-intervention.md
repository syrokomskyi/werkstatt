---
rfcId: RFC-0554
planId: PLAN-RFC-0554-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0554

## 1. Objectives

- [ ] Objective 1 — Add step 0 (silent version check) to forge-bootstrap SKILL.md — maps to acceptance criterion 1, 2, 3
- [ ] Objective 2 — Document the silent forge-bootstrap trigger in packages/forge/AGENTS.md — maps to acceptance criterion 7
- [ ] Objective 3 — Verify forge.upgrade CLI remains unchanged and functional — maps to acceptance criterion 6
- [ ] Objective 4 — Verify runUpgrade error handling is silent (session log, not operator-facing) — maps to acceptance criterion 5
- [ ] Objective 5 — Validate SKILL.md, RFC, and typecheck all pass — maps to acceptance criterion 8

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — add step 0 before step 1 (language selection)
- `packages/forge/src/onboarding/upgrade.ts` — no changes, `runUpgrade` reused as-is
- `packages/forge/src/config/forge-config.ts` — no changes, `forge.syncedVersion` already exists

No new commands. No registry entries. No pipeline wiring changes. The `forge.upgrade` CLI command remains unchanged.

### 2.2 Configuration and data

- `forge.yaml` — no schema changes. `forge.syncedVersion` already exists (RFC-0543).

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — document the silent `forge-bootstrap` trigger in the `forge.upgrade` section
- RFC file (read-only reference): `docs/rfcs/rfc-0554-silent-migration-on-forge-upgrade-detect-version-change-and-auto-migrate-without-operator-intervention.md`

### 2.4 Validation and pipelines

- `pnpm exec forge skill.validate` — verify the modified SKILL.md passes SKILL-01..16
- `pnpm exec forge rfc.validate --id RFC-0554` — verify the RFC passes
- `pnpm --filter @warpgogol/forge run build:check` — typecheck (no TS changes expected, but verifies no regressions)
- `pnpm --filter @warpgogol/forge run test` — existing upgrade tests still pass

## 3. Step sequence

### Step 1. Add step 0 to forge-bootstrap SKILL.md

**Goal:** Add a silent version check as step 0, before the existing step 1 (language selection), instructing the agent to compare `forge.syncedVersion` against the installed `@warpgogol/forge` version and silently run `forge upgrade` if they differ.

**Agent actions:**

- Read `packages/forge/skills/meta/forge-bootstrap/SKILL.md`
- Add a new `### 0. Silent version check (before language selection)` section before `### 1. Language selection (first step)`
- The step 0 instructions must direct the agent to:
  1. Read `forge.yaml` and extract `forge.syncedVersion`
  2. Resolve the installed `@warpgogol/forge` version (by reading `node_modules/@warpgogol/forge/package.json` or running `forge upgrade --json` and checking the output)
  3. If versions match — skip to step 1, no migration needed
  4. If versions differ (or `syncedVersion` is `null`/absent) — silently run `forge upgrade` via CLI (the agent runs the command internally and does not show any output to the operator — the upgrade happens invisibly)
  5. If `forge upgrade` fails — log the error to the session log (not shown to the operator), proceed to step 1 with the old configuration
  6. Proceed to step 1 (language selection) regardless of success or failure
- Note: the RFC's TypeScript contracts section mentions "internal function call" as the ideal mechanism. In practice, since `forge-bootstrap` is a skill (instructions for an AI agent), the agent runs `forge upgrade` CLI silently. The effect is the same: `runUpgrade` executes, syncs skills, updates binding defaults, and updates `forge.syncedVersion`. The operator sees nothing.
- Add a guardrail to the Guardrails section: "The skill never informs the operator about migration, version numbers, or upgrade mechanics — the silent version check in step 0 is invisible to the operator."
- Add a guardrail: "The skill never asks the operator for permission to migrate — if versions differ, migration runs automatically."

**Validation:**

- `pnpm exec forge skill.validate` — SKILL.md passes all SKILL-01..16 rules
- Visual inspection: step 0 appears before step 1, guardrails section includes the two new guardrails

**Completion criterion:** `packages/forge/skills/meta/forge-bootstrap/SKILL.md` contains step 0 with silent version check instructions and two new guardrails; `forge.skill.validate` passes.

**Human review:** no

---

### Step 2. Update packages/forge/AGENTS.md

**Goal:** Document the silent `forge-bootstrap` trigger in the `forge.upgrade` section of `packages/forge/AGENTS.md`.

**Agent actions:**

- Read `packages/forge/AGENTS.md`
- In the `forge.yaml (RFC-0391)` section or near the existing `forge.upgrade` mention in the OS modules table, add a note: "`forge-bootstrap` skill step 0 silently checks `forge.syncedVersion` against the installed version and runs `forge upgrade` if they differ. The operator is never informed about migration. See RFC-0554."

**Validation:**

- Visual inspection: the AGENTS.md mentions the silent trigger and references RFC-0554

**Completion criterion:** `packages/forge/AGENTS.md` documents the silent `forge-bootstrap` trigger with RFC-0554 reference.

**Human review:** no

---

### Step 3. Run validation suite

**Goal:** Verify all acceptance criteria pass and no regressions are introduced.

**Agent actions:**

- Run `pnpm exec forge rfc.validate --id RFC-0554 --json` — verify zero RFC-0554-specific violations
- Run `pnpm exec forge skill.validate` — verify SKILL-01..16 pass for all skills including modified forge-bootstrap
- Run `pnpm --filter @warpgogol/forge run build:check` — typecheck passes (no TS changes, but verifies no regressions from SKILL.md changes)
- Run `pnpm --filter @warpgogol/forge run test` — existing upgrade tests still pass (runUpgrade is unchanged)
- Verify `forge.upgrade` CLI still works: `pnpm exec forge upgrade --help` prints help

**Validation:**

- All commands exit 0
- No RFC-0554-specific violations in rfc.validate output

**Completion criterion:** rfc.validate, skill.validate, build:check, and test all pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (step 2)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no changes expected — SKILL.md content change only)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented changes. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec forge rfc.implement.stamp --id RFC-0554 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec forge rfc.validate --id RFC-0554`
- Review report exists for this session.
- All 8 acceptance criteria checked off with evidence annotations.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec forge rfc.validate --id RFC-0554`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec forge skill.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0554` in the subject line
- SKILL.md diff showing step 0 addition
- AGENTS.md diff showing silent trigger documentation

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Silent migration breaks something | Step 3 verifies existing upgrade tests pass; runUpgrade is idempotent (RFC-0543) |
| Performance impact | Step 0 is two file reads + string comparison; full upgrade only runs when versions differ |
| Agent misinterpretation | Step 1 adds two explicit guardrails to SKILL.md forbidding operator-facing migration text |
| Concurrent forge-bootstrap runs | Accepted residual risk; runUpgrade is idempotent, last writer wins with same version |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0554 --reason "..." --invariant "DNA-54"` instead of working around it.
