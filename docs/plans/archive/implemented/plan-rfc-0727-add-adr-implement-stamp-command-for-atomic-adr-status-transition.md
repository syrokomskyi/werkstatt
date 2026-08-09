---
rfcId: RFC-0727
planId: PLAN-RFC-0727-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/forge/AGENTS.md
    - .gitignore
    - forge.yaml
---

# Implementation Plan: RFC-0727

## 1. Objectives

- [ ] Objective 1 — Add `AdrImplementStamp*` types to ADR module types — maps to acceptance criterion "TypeScript types defined"
- [ ] Objective 2 — Create `adr.implement.stamp` handler with ADR-IMP-01/03/04/05 validation — maps to acceptance criteria for each rule
- [ ] Objective 3 — Register `adr.implement.stamp` command in `forgeAdrModule` — maps to acceptance criterion "command registered"
- [ ] Objective 4 — Update AV-16 warning message to reference `adr.implement.stamp` — maps to acceptance criterion "AV-16 updated"
- [ ] Objective 5 — Update `fo-idea-implement` step 4.10 + 4.10b and `fo-idea-plan` step 8 — maps to acceptance criteria for skill updates
- [ ] Objective 6 — Update `packages/forge/AGENTS.md`, `forge.yaml` bindings, `.gitignore` — maps to acceptance criteria for docs/config
- [ ] Objective 7 — Unit tests covering all ADR-IMP rules, dry-run, atomic stamp, post-hoc ADR — maps to acceptance criterion "unit tests"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/adr/types.ts` — add `AdrImplementStampRule`, `AdrImplementStampData`, `AdrImplementStampViolation`, `AdrImplementStampResult`
- `packages/forge/os/adr/handlers/implement-stamp.ts` — new handler (main stamp logic)
- `packages/forge/os/adr/adr.module.ts` — register `adr.implement.stamp` command
- `packages/forge/os/adr/handlers/validate.ts` — update AV-16 warning message

### 2.2 Configuration and data

- `forge.yaml` — add `adrImplementStamp` binding under `bindings.commands`
- `.gitignore` — add `.adr-locks` entry

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update `forgeAdrModule` command table to include `adr.implement.stamp`
- `packages/forge/skills/fo/fo-idea-implement/SKILL.md` — step 4.10 uses `adr.implement.stamp`; step 4.10b gate references `adr.implement.stamp`
- `packages/forge/skills/fo/fo-idea-plan/SKILL.md` — step 8 references `adr.implement.stamp` for ADR transitions
- `.agents/skills/fo/fo-idea-implement/SKILL.md` — synced copy
- `.agents/skills/fo/fo-idea-plan/SKILL.md` — synced copy

### 2.4 Validation and pipelines

- No pipeline integration — `adr.implement.stamp` is a manual command, same as `rfc.implement.stamp`
- No `build.check` or CI changes

## 3. Step sequence

### Step 1. Add ADR stamp types

**Goal:** Define TypeScript contracts for the stamp command.

**Agent actions:**

- Add `AdrImplementStampRule` type (`"ADR-IMP-01" | "ADR-IMP-03" | "ADR-IMP-04" | "ADR-IMP-05"`) to `packages/forge/os/adr/types.ts`
- Add `AdrImplementStampData` interface (`adrId`, `implementationCommit`, `stampedAt`)
- Add `AdrImplementStampViolation` interface (`rule`, `message`)
- Add `AdrImplementStampResult` interface (`command`, `status`, `data?`, `violations`)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles

**Completion criterion:** Types are exported from `packages/forge/os/adr/types.ts` and the package compiles.

**Human review:** no

---

### Step 2. Create stamp handler

**Goal:** Implement `runAdrImplementStamp` handler with all ADR-IMP validations.

**Agent actions:**

- Create `packages/forge/os/adr/handlers/implement-stamp.ts`
- Reuse git helper patterns from `packages/forge/os/rfc/handlers/implement-stamp.ts`: `execGit`, lock acquire/release, `mutateAdrFrontmatter`
- Implement ADR-IMP-01: check ADR status is `accepted` or `proposed` (not `reviewing`, `implemented`, `superseded`, `rejected`)
- Implement ADR-IMP-03: validate `--implementation-commit` is reachable from HEAD and references the ADR id (commit message `implement: ADR-XXXX` prefix OR changed-files slug matching `adr-XXXX`)
- Implement ADR-IMP-04: check ADR file has no uncommitted changes (`git status --porcelain`)
- Implement ADR-IMP-05: acquire exclusive lock at `.adr-locks/<adr-id>.lock`
- Implement `mutateAdrFrontmatter`: regex-based replacement of `status`, `implementedAt`, `updatedAt`
- Implement `--dry-run` flag: check all preconditions without mutating the file
- Import ADR frontmatter parsing from existing `packages/forge/os/adr/handlers/validate.ts` or shared utilities

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles
- Manual dry-run test: `pnpm exec werkstatt run adr.implement.stamp --id ADR-0001 --implementation-commit <sha> --dry-run`

**Completion criterion:** Handler compiles, all 4 ADR-IMP rules implemented, dry-run mode works.

**Human review:** no

---

### Step 3. Register command in ADR module

**Goal:** Register `adr.implement.stamp` in `forgeAdrModule`.

**Agent actions:**

- Add `runAdrImplementStamp` import to `packages/forge/os/adr/adr.module.ts`
- Register command with `name: "adr.implement.stamp"`, `scope: "workspace"`, flags: `--id`, `--implementation-commit`, `--dry-run`
- Set `mutatesState: true`, `writes: ["docs/adrs/*.md"]`, `reads: ["docs/adrs/**/*.md"]`
- Add `cacheable: false`

**Validation:**

- `pnpm exec werkstatt run adr.implement.stamp --id ADR-0001 --dry-run --implementation-commit HEAD` — command is discovered and runs

**Completion criterion:** Command appears in registry and is callable via CLI.

**Human review:** no

---

### Step 4. Update AV-16 warning message

**Goal:** Direct AV-16 warning to `adr.implement.stamp` instead of manual editing.

**Agent actions:**

- In `packages/forge/os/adr/handlers/validate.ts`, find the AV-16 warning message
- Change from: "Set status: implemented and implementedAt to complete."
- Change to: "Run: site-kernel run adr.implement.stamp --id <adr-id> --implementation-commit <sha> to transition to implemented."

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- Existing AV-16 tests still pass (message text changed, rule logic unchanged)

**Completion criterion:** AV-16 message references `adr.implement.stamp`.

**Human review:** no

---

### Step 5. Update skills (fo-idea-implement + fo-idea-plan)

**Goal:** Replace manual ADR frontmatter editing with `adr.implement.stamp` in skills.

**Agent actions:**

- In `packages/forge/skills/fo/fo-idea-implement/SKILL.md`:
  - Step 4.10: replace manual `status: implemented` / `implementedAt` / `updatedAt` editing with `adr.implement.stamp --id ADR-XXXX --implementation-commit <sha>`
  - Step 4.10b gate: replace "go back to step 4.10 and set status: implemented" with "go back to step 4.10 and run `adr.implement.stamp`"
- In `packages/forge/skills/fo/fo-idea-plan/SKILL.md`:
  - Step 8: replace "For ADRs, manually set status: implemented and implementedAt" with "For ADRs, run `adr.implement.stamp --id ADR-XXXX --implementation-commit <sha>`"
- Sync both files to `.agents/skills/fo/fo-idea-implement/SKILL.md` and `.agents/skills/fo/fo-idea-plan/SKILL.md`

**Validation:**

- `pnpm exec werkstatt run skill.validate` — skills pass validation
- `pnpm exec werkstatt run forge.doctor` — no skill drift

**Completion criterion:** Both skills reference `adr.implement.stamp` instead of manual editing; synced copies match.

**Human review:** no

---

### Step 6. Update documentation and config

**Goal:** Sync AGENTS.md, forge.yaml, .gitignore.

**Agent actions:**

- Update `packages/forge/AGENTS.md` `forgeAdrModule` row: add `adr.implement.stamp` to command list
- Add `adrImplementStamp` binding to `forge.yaml` under `bindings.commands`:
  ```yaml
  adrImplementStamp: pnpm exec werkstatt run adr.implement.stamp --id {id}
    --implementation-commit {commit}
  ```
- Add `.adr-locks` to `.gitignore` (near existing `.rfc-locks` entry)

**Validation:**

- `pnpm exec werkstatt run forge.doctor` — no drift
- `pnpm exec werkstatt run ecosystem.manifest.generate` — regenerate manifest if command surface changed

**Completion criterion:** All three files updated, forge.doctor passes.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Comprehensive test coverage for all ADR-IMP rules and scenarios.

**Agent actions:**

- Create `packages/forge/src/tests/adr-implement-stamp.test.ts`
- Test cases:
  - ADR-IMP-01: ADR with status `superseded` → rejected
  - ADR-IMP-01: ADR with status `reviewing` → rejected
  - ADR-IMP-01: ADR with status `implemented` → rejected (already implemented)
  - ADR-IMP-01: ADR with status `accepted` → passes status check
  - ADR-IMP-01: ADR with status `proposed` → passes status check (post-hoc)
  - ADR-IMP-03: commit not reachable from HEAD → rejected
  - ADR-IMP-03: commit reachable but does not reference ADR id → rejected
  - ADR-IMP-03: commit reachable and references ADR id in message → passes
  - ADR-IMP-03: commit reachable and references ADR id in changed files → passes
  - ADR-IMP-04: ADR file has uncommitted changes → rejected
  - ADR-IMP-04: ADR file clean → passes
  - ADR-IMP-05: concurrent lock held → rejected
  - ADR-IMP-05: lock acquired successfully → passes
  - Dry-run: all preconditions checked, file not mutated
  - Atomic stamp: `status`, `implementedAt`, `updatedAt` mutated correctly
  - Post-hoc ADR: `proposed → implemented` transition works

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** All test cases pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0727 --implementation-commit <sha>`.
- Update `RFC-0625.amendedBy` to include `RFC-0727` (resolves V-19 warning).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0727` — zero errors.
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0727`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run forge.doctor`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0727` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared — `rfc.verification.emit` not required

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Post-hoc ADR abuse | Step 2: ADR-IMP-01 validates status; `decider` field required by AV-05 |
| Commit reference false negatives from squash merges | Step 2: ADR-IMP-03 accepts changed-files slug matching as alternative to commit message prefix |
| Lock file cleanup | Step 2: `finally` block releases lock; same pattern as `rfc.implement.stamp` |
| Agent confusion from `proposed → implemented` | Step 5: skill updates direct agents to use `adr.implement.stamp`; dry-run flag available |
| Skill sync drift | Step 5: synced copies committed in same step; `forge.doctor` verifies in Final Step |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0727 --reason "..." --invariant "DNA-N"` instead of working around it.
