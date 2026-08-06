---
rfcId: RFC-0722
planId: PLAN-RFC-0722-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - docs/policies/rfc-governance.md
    - hooks/pre-commit
---

# Implementation Plan: RFC-0722

## 1. Objectives

- [ ] Objective 1 — Add pre-commit hook guard blocking commits staging files in unauthorized subdirectories under `docs/rfcs/` and `docs/adrs/` (maps to acceptance criterion: pre-commit hook)
- [ ] Objective 2 — Add RFC-DIR-01 warning rule to `rfc.validate` detecting RFC files in unsanctioned subdirectories (maps to acceptance criterion: RFC-DIR-01)
- [ ] Objective 3 — Add ADR-DIR-01 warning rule to `adr.validate` detecting ADR files in unsanctioned subdirectories (maps to acceptance criterion: ADR-DIR-01)
- [ ] Objective 4 — Add governance rule to `docs/policies/rfc-governance.md` requiring ADR for directory structure changes (maps to acceptance criterion: governance rule)
- [ ] Objective 5 — Verify `docs/rfcs/draft/` does not exist and no unsanctioned subdirectories remain (maps to acceptance criterion: draft directory removed)
- [ ] Objective 6 — Pass all validation and build checks (maps to acceptance criteria: rfc.validate, adr.validate, build:check)

## 2. Affected artifacts

### 2.1 Code and commands

- `hooks/pre-commit` — add directory structure guard after CSS token check (line 121), before command manifest staleness check (line 123)
- `packages/forge/os/rfc/handlers/validate-rules.ts` — add RFC-DIR-01 warning rule in `validateSingleRfc` function (after V-01 id format check, ~line 210)
- `packages/forge/os/adr/handlers/validate.ts` — add ADR-DIR-01 warning rule in `validateSingleAdr` function (after AV-01 id format check, ~line 182)

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `docs/policies/rfc-governance.md` — add rule 9: directory structure changes require ADR (after rule 8, ~line 262)
- RFC file (read-only reference): `docs/rfcs/rfc-0722-enforce-rfc-and-adr-directory-structure-convention.md`

### 2.4 Validation and pipelines

- `rfc.validate` — extended with RFC-DIR-01 (warning severity)
- `adr.validate` — extended with ADR-DIR-01 (warning severity)
- `pnpm --filter @warpgogol/forge build:check` — must pass after code changes
- Pre-commit hook — active immediately after implementation

## 3. Step sequence

### Step 1. Add RFC-DIR-01 validation rule

**Goal:** Add warning-severity directory structure check to `rfc.validate`.

**Agent actions:**

- In `packages/forge/os/rfc/handlers/validate-rules.ts`, inside `validateSingleRfc`, after the V-01 id format check (~line 210), add a directory structure check:
  - Extract the subdirectory from `fileName` (the relative path from `docs/rfcs/`). If `fileName` contains a path separator (`/`), the first segment is the subdirectory name.
  - If the subdirectory is neither `archive` nor `verification`, emit a warning: `RFC-DIR-01: <relFile> is in an unsanctioned subdirectory. Only archive/ and verification/ are allowed. Move the file to docs/rfcs/ root or write an ADR to formalize the subdirectory.`
  - Use `addViolation(rfcId, relFile, "RFC-DIR-01", message, "warning")`.

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0722 --json` — must pass (RFC-0722 is at root, not in a subdirectory)
- `pnpm --filter @warpgogol/forge build:check` — must pass

**Completion criterion:** RFC-DIR-01 rule is present in `validate-rules.ts`; `rfc.validate` passes for all existing RFCs (none are in unsanctioned subdirectories).

**Human review:** no

---

### Step 2. Add ADR-DIR-01 validation rule

**Goal:** Add warning-severity directory structure check to `adr.validate`.

**Agent actions:**

- In `packages/forge/os/adr/handlers/validate.ts`, inside `validateSingleAdr`, after the AV-01 id format check (~line 182), add a directory structure check:
  - Extract the subdirectory from `fileName` (the relative path from `docs/adrs/`). If `fileName` contains a path separator (`/`), the first segment is the subdirectory name.
  - If the subdirectory is neither `archive` (the only sanctioned ADR subdirectory), emit a warning: `ADR-DIR-01: <relFile> is in an unsanctioned subdirectory. Only archive/ is allowed. Move the file to docs/adrs/ root or write an ADR to formalize the subdirectory.`
  - Use `addViolation(adrId, relFile, "ADR-DIR-01", message, "warning")`.

**Validation:**

- `pnpm exec site-kernel run adr.validate --json` — must pass (all ADRs are either at root or in `archive/`)
- `pnpm --filter @warpgogol/forge build:check` — must pass

**Completion criterion:** ADR-DIR-01 rule is present in `validate.ts`; `adr.validate` passes for all existing ADRs.

**Human review:** no

---

### Step 3. Add pre-commit hook guard

**Goal:** Block commits that stage files in unauthorized subdirectories under `docs/rfcs/` or `docs/adrs/`.

**Agent actions:**

- In `hooks/pre-commit`, after the CSS token check block (line 121) and before the command manifest staleness check (line 123), add the directory structure guard:
  - Collect staged files matching `docs/rfcs/` or `docs/adrs/` via `git diff --cached --name-only`.
  - For each staged file, use a `case` statement to check if it's in an unauthorized subdirectory:
    - `docs/rfcs/archive/*` and `docs/rfcs/verification/*` → allowed
    - `docs/rfcs/*/*` (any other subdirectory) → error
    - `docs/adrs/archive/*` → allowed
    - `docs/adrs/*/*` (any other subdirectory) → error
  - Root-level files (`docs/rfcs/*.md`, `docs/rfcs/index.yaml`, etc.) are never matched by `*/*` patterns and are always allowed.
  - If any errors found, print to stderr and `exit 1`.

**Validation:**

- Code review verifies the `case` patterns are correct (allowed subdirectories checked before catch-all `*/*`).
- The implementation commit itself exercises the hook — if the hook has a bug, the commit will fail.

**Completion criterion:** Pre-commit hook code is present and correct; `case` patterns allow `archive/`, `verification/` (RFCs) and `archive/` (ADRs), block all other subdirectories.

**Human review:** no

---

### Step 4. Add governance rule to rfc-governance.md

**Goal:** Document the directory structure ADR requirement in the RFC governance policy.

**Agent actions:**

- In `docs/policies/rfc-governance.md`, after rule 8 (line 262), add rule 9:
  > **9. Directory structure changes under `docs/rfcs/` and `docs/adrs/` require an accepted ADR.** Agents MUST NOT create new subdirectories in these paths without an accepted ADR defining the convention, the creation command behavior, and the archive flow. The only sanctioned subdirectories are `archive/` (RFC-0367) and `verification/` (generated JSON, not RFC files).

**Validation:**

- File content review — rule is present and formatted consistently with other rules.

**Completion criterion:** Rule 9 is present in `docs/policies/rfc-governance.md`.

**Human review:** no

---

### Step 5. Add unit tests for validation rules

**Goal:** Verify RFC-DIR-01 and ADR-DIR-01 emit warnings for files in unsanctioned subdirectories.

**Agent actions:**

- Add a unit test for RFC-DIR-01 in the forge package test suite:
  - Create a mock RFC file in a `draft/` subdirectory (relative to a temp RFC dir).
  - Run `validateSingleRfc` and assert that a warning with rule `RFC-DIR-01` is emitted.
  - Also verify that a file at root and a file in `archive/` do NOT emit RFC-DIR-01.
- Add a unit test for ADR-DIR-01 in the forge package test suite:
  - Create a mock ADR file in a `draft/` subdirectory.
  - Run `validateSingleAdr` and assert that a warning with rule `ADR-DIR-01` is emitted.
  - Also verify that a file at root and a file in `archive/` do NOT emit ADR-DIR-01.

**Validation:**

- `pnpm --filter @warpgogol/forge test` — tests pass

**Completion criterion:** Unit tests for both rules pass and cover the positive (unsanctioned) and negative (root + sanctioned) cases.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `docs/policies/rfc-governance.md` is updated with rule 9.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands added, only validation rules extended — likely not needed, but verify).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0722 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0722`
- `pnpm exec site-kernel run adr.validate`
- `pnpm --filter @warpgogol/forge build:check`
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0722`
- `pnpm exec site-kernel run adr.validate`
- `pnpm --filter @warpgogol/forge build:check`
- `pnpm --filter @warpgogol/forge test` (if tests added)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0722` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared — `rfc.verification.emit` not required

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pre-commit hook bypass via `--no-verify` | Step 1–2: validation rules in `rfc.validate`/`adr.validate` provide second layer of detection |
| False positives for generated files | Step 3: hook checks only `*/*` patterns (subdirectories), not root-level file types; `verification/` explicitly allowed |
| Maintenance burden (hardcoded list in two places) | Step 1–2: list is minimal (`archive/`, `verification/`) and rarely changes; ADRs are rare |
| Agent misinterpretation (hook vs validation) | Step 4: governance rule clarifies distinction; implementation notes in RFC specify warning vs error |

## 6. Escalation triggers

- If implementation reveals that `listRfcFiles` or `listAdrFiles` returns paths in a format that doesn't contain subdirectory information (e.g. basename only), stop and investigate the `fileName` parameter format before proceeding.
- If the pre-commit hook conflicts with `ecosystem.commit` flow (platform-scope files staged in `docs/rfcs/`), escalate — the hook should only check for subdirectory violations, not platform scope (which is already handled by the existing platform-scope guard).
