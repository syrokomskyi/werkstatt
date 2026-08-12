---
rfcId: RFC-0819
planId: PLAN-RFC-0819-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/policies/agent-surface-ops.md
    - AGENTS.md
    - .env.example
---

# Implementation Plan: RFC-0819

## 1. Objectives

- [ ] Objective 1 — Update DEPLOY-PREFLIGHT-04 fixHint to suggest `null` — maps to acceptance criterion [fixHint includes null suggestion]
- [ ] Objective 2 — Document the `null` convention in `docs/policies/agent-surface-ops.md` — maps to acceptance criterion [agent-surface-ops.md documents convention]
- [ ] Objective 3 — Add one-line pointer in root `AGENTS.md` — maps to acceptance criterion [AGENTS.md has pointer]
- [ ] Objective 4 — Update root `.env.example` header comment — maps to acceptance criterion [.env.example header mentions null]
- [ ] Objective 5 — Verify `.env` with `KEY=null` passes and `KEY=` fails with updated message — maps to acceptance criteria [pass/fail behavior]
- [ ] Objective 6 — Verify `.env.example` with `KEY=null` still rejected by ENV-CONTRACT-04 — maps to acceptance criterion [example files remain empty-only]
- [ ] Objective 7 — Verify `deploy.preflight --dev` also gets the `null` suggestion — maps to acceptance criterion [.env.dev verification]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/env/deploy-preflight.ts` — DEPLOY-PREFLIGHT-04 `fixHint` string update (line ~186)

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `docs/policies/agent-surface-ops.md` — add `null` convention to Env-and-deploy contract section
- `AGENTS.md` — add one-line pointer to the `null` convention in the env-and-deploy reference (line ~252)
- `.env.example` — update header comment to mention the `null` convention for `.env` files

### 2.4 Validation and pipelines

- `deploy.preflight` — no pipeline changes, existing pre-deploy gate
- `env.contract.validate` — no changes, still rejects `null` in `.env.example`

## 3. Step sequence

### Step 1. Update DEPLOY-PREFLIGHT-04 fixHint

**Goal:** Change the `fixHint` string in `deploy-preflight.ts` to suggest `null` for not-required variables.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/env/deploy-preflight.ts` line ~186: change `fixHint: \`Fill in the value for ${key} in ${targetLabel}.\`` to `fixHint: \`Fill in the value for ${key} in ${targetLabel}, or set it to null if this variable is not required for this deployment.\``

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `deploy-preflight.ts` line ~186 contains the updated `fixHint` string with `null` suggestion.

**Human review:** no

---

### Step 2. Document the null convention in `docs/policies/agent-surface-ops.md`

**Goal:** Add the `null` convention to the Env-and-deploy contract section.

**Agent actions:**

- Add a bullet point after the existing "Values in `.env.example` MUST stay empty" bullet: "In `.env` files, variables that are listed in `.env.example` but not required for a specific deployment MAY be set to `null` (the literal string) to signal intentional non-configuration. `deploy.preflight` accepts `null` as a valid non-empty value."

**Validation:**

- File contains the `null` convention text in the Env-and-deploy contract section

**Completion criterion:** `docs/policies/agent-surface-ops.md` Env-and-deploy section includes the `null` convention bullet.

**Human review:** no

---

### Step 3. Add one-line pointer in root `AGENTS.md`

**Goal:** Add a brief mention of the `null` convention in the env-and-deploy reference line.

**Agent actions:**

- Update the line at ~252 that references "Env-and-deploy contract (RFC-0761 / DNA-40)" to include mention of the `null` convention, e.g. append "; `null` marker for not-required variables (RFC-0819)"

**Validation:**

- `AGENTS.md` line ~252 mentions the `null` convention

**Completion criterion:** Root `AGENTS.md` env-and-deploy reference includes a pointer to the `null` convention.

**Human review:** no

---

### Step 4. Update root `.env.example` header comment

**Goal:** Add a comment in the `.env.example` header explaining the `null` convention for `.env` files.

**Agent actions:**

- Add a comment line near the top of `.env.example` (after existing header comments) explaining: "# In .env files, set KEY=null for variables listed here that are not required for a specific deployment."

**Validation:**

- `.env.example` header contains the `null` convention comment

**Completion criterion:** Root `.env.example` header comment mentions the `null` convention for `.env` files.

**Human review:** no

---

### Step 5. Write unit test for DEPLOY-PREFLIGHT-04 fixHint

**Goal:** Add a unit test verifying the updated `fixHint` message.

**Agent actions:**

- Find or create a test file for `deploy-preflight.ts` in `packages/werkstatt-site/src/checks/env/tests/`
- Add test: create a temp `.env` with `KEY=` (empty) and `.env.example` with `KEY=`, run `deploy.preflight`, verify the diagnostic `fixHint` contains "null"
- Add test: create a temp `.env` with `KEY=null`, verify `deploy.preflight` passes

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — tests pass

**Completion criterion:** Unit tests verify both the `null` pass case and the empty-value fail case with updated `fixHint`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they didn't — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0819` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0819`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0819`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0819` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Runtime confusion with string `"null"` | Step 2 documents that `null` means "do not read this variable at runtime" in `agent-surface-ops.md` |
| Agent misinterpretation (writing `null` in `.env.example`) | Step 5 test verifies `.env.example` with `null` is still rejected by ENV-CONTRACT-04 |
| Confusion with JSON `null` | Step 2 documentation clarifies it's the literal string `"null"` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0819 --reason "..." --invariant "DNA-N"` instead of working around it.
