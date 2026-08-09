---
rfcId: RFC-0733
planId: PLAN-RFC-0733-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - AGENTS.md
    - docs/architecture-dna.md
---

# Implementation Plan: RFC-0733

## 1. Objectives

- [ ] O1 — `pinned.init` command creates `.forge/pinned.yaml`, installs pre-commit hook, adds audit log to `.gitignore` — maps to acceptance criterion 1
- [ ] O2 — `pinned.validate` command detects delete/move/modify violations, supports `--allow-pinned-override`, `--json`, `--mode ci` — maps to acceptance criteria 2–4
- [ ] O3 — Archive commands (7 handlers) call shared pre-check utility and skip pinned files — maps to acceptance criterion 5
- [ ] O4 — Manifest self-protection with `PINNED_MANIFEST_TAMPERED` integrity check — maps to acceptance criterion 6
- [ ] O5 — CI workflow template generation via `pinned.init --ci` — maps to acceptance criterion 7
- [ ] O6 — Repositories without `.forge/pinned.yaml` are unaffected — maps to acceptance criterion 8
- [ ] O7 — Unit tests covering all failure modes and archive pre-check — maps to acceptance criterion 9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/core/handlers/pinned-types.ts` — TypeScript contracts (PinnedEntry, PinnedManifest, PinnedViolation, PinnedValidateOptions, PinnedValidateResult)
- `packages/forge/os/core/handlers/pinned-check.ts` — shared pre-check utility (`isPinned` lookup, manifest loader with cache)
- `packages/forge/os/core/handlers/pinned-init.ts` — `pinned.init` handler implementation
- `packages/forge/os/core/handlers/pinned-validate.ts` — `pinned.validate` handler implementation
- `packages/forge/os/core/core.module.ts` — command registration for `pinned.init` and `pinned.validate`
- `packages/forge/os/rfc/handlers/archive.ts` — add pinned pre-check before `fs.rename`
- `packages/forge/os/adr/handlers/archive.ts` — add pinned pre-check
- `packages/forge/os/plan/handlers/archive.ts` — add pinned pre-check
- `packages/forge/os/audit/handlers/archive.ts` — add pinned pre-check
- `packages/forge/os/session/handlers/archive.ts` — add pinned pre-check
- `packages/forge/os/mission/handlers/archive.ts` — add pinned pre-check
- `packages/forge/os/core/handlers/pinned-hook-template.sh` — pre-commit hook template (embedded as string or shipped as asset)
- `packages/forge/os/core/handlers/pinned-ci-template.yml` — CI workflow template

### 2.2 Configuration and data

- `.forge/pinned.yaml` — manifest file (created by `pinned.init`, not committed in forge package itself)
- `.forge/pinned-audit.log` — append-only audit log (gitignored, created at runtime)
- `.gitignore` — `pinned.init` appends `.forge/pinned-audit.log` entry

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — new section documenting pinned commands, `.forge/` convention, override policy, archive pre-check behavior
- `AGENTS.md` (root) — mention `.forge/` directory convention in repository structure section
- `docs/architecture-dna.md` — DNA-62 already added (no further changes needed)

### 2.4 Validation and pipelines

- `packages/forge/src/tests/pinned-validate.test.ts` — unit tests for `pinned.validate`
- `packages/forge/src/tests/pinned-init.test.ts` — unit tests for `pinned.init`
- `packages/forge/src/tests/pinned-check.test.ts` — unit tests for shared pre-check utility
- `packages/forge/src/tests/pinned-archive-integration.test.ts` — integration tests for archive pre-check
- `docs/command-manifest.generated.yaml` — regenerate after adding new commands

## 3. Step sequence

### Step 0. TypeScript contracts and shared utility

**Goal:** Create the type definitions and shared pre-check utility that all other steps depend on.

**Agent actions:**

- Create `packages/forge/os/core/handlers/pinned-types.ts` with interfaces from RFC TypeScript contracts section (PinnedEntry, PinnedManifest, PinnedViolation, PinnedValidateOptions, PinnedValidateResult)
- Create `packages/forge/os/core/handlers/pinned-check.ts` with:
  - `loadPinnedManifest(repoRoot: string): Promise<PinnedManifest | null>` — loads `.forge/pinned.yaml`, returns null if missing
  - `isPinned(manifest: PinnedManifest, relPath: string): PinnedEntry | null` — lookup function, handles directory matching (trailing `/`)
  - `checkFilesForPinned(manifest: PinnedManifest, filePaths: string[]): PinnedViolation[]` — batch check for archive handlers
- Use `yaml` package (already in forge dependencies) for manifest parsing
- Use `writeFileIfChanged` from `@warpgogol/forge/utils` for manifest writes

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes with new files

**Completion criterion:** `pinned-types.ts` and `pinned-check.ts` exist, export all required interfaces/functions, and typecheck passes.

**Human review:** no

---

### Step 1. `pinned.validate` handler

**Goal:** Implement the validation command that checks working tree against manifest.

**Agent actions:**

- Create `packages/forge/os/core/handlers/pinned-validate.ts` with `runPinnedValidate` function:
  - Load manifest via `loadPinnedManifest` (exit 0 with info if missing)
  - Parse manifest YAML (exit 2 if malformed)
  - Determine diff source: `git diff --cached --name-status` (staged mode) or `git diff --name-status HEAD~1 HEAD` (ci mode)
  - For each changed file, classify operation (delete/move/modify) from git status codes (D, R, M)
  - Check each against `isPinned` — collect violations
  - Filter violations by `--allow-pinned-override` paths
  - Log overrides to `.forge/pinned-audit.log` via `fs.appendFile` (atomic per-line JSONL)
  - Manifest integrity check: compare current `.forge/pinned.yaml` against `git show HEAD:.forge/pinned.yaml` — if entries removed, emit `PINNED_MANIFEST_TAMPERED`
  - Return `PinnedValidateResult` with status, violations, overrides
  - Support `--json` flag for structured output
- Register `forge pinned.validate` command in `core.module.ts` with flags: `--allow-pinned-override` (string, repeatable), `--mode` (staged|ci), `--json`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Unit test: violation detected for delete/move/modify on freeze-mode file
- Unit test: override passes and audit log entry written
- Unit test: manifest missing → exit 0 with info
- Unit test: manifest tampered → PINNED_MANIFEST_TAMPERED error

**Completion criterion:** `pinned.validate` handler exists, registered in core.module.ts, passes typecheck and unit tests.

**Human review:** no

---

### Step 2. `pinned.init` handler

**Goal:** Implement the initialization command that creates the manifest and installs hooks.

**Agent actions:**

- Create `packages/forge/os/core/handlers/pinned-init.ts` with `runPinnedInit` function:
  - Create `.forge/` directory if missing
  - Create `.forge/pinned.yaml` with default entries from RFC manifest format section
  - If manifest exists: merge defaults with existing entries (re-add missing defaults, never overwrite custom entries)
  - Install pre-commit hook: check `.git/hooks/pre-commit` — if missing, write forge hook template; if exists, append forge check with marker comment for idempotent re-installation
  - Add `.forge/pinned-audit.log` to `.gitignore` (or append to existing)
  - Optional `--ci` flag: generate `.github/workflows/pinned-check.yml` from template
  - Use `writeFileIfChanged` for all file writes
- Register `forge pinned.init` command in `core.module.ts` with flag: `--ci` (boolean)
- Embed pre-commit hook template and CI workflow template as string constants (or ship as asset files in `packages/forge/os/core/handlers/`)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Unit test: `pinned.init` creates `.forge/pinned.yaml` with default entries
- Unit test: `pinned.init` installs pre-commit hook
- Unit test: `pinned.init` adds `.forge/pinned-audit.log` to `.gitignore`
- Unit test: `pinned.init --ci` generates `.github/workflows/pinned-check.yml`
- Unit test: re-running `pinned.init` merges defaults without overwriting custom entries

**Completion criterion:** `pinned.init` handler exists, registered in core.module.ts, passes typecheck and unit tests.

**Human review:** no

---

### Step 3. Archive command integration

**Goal:** Add pinned pre-check to all 6 archive handlers so they skip pinned files.

**Agent actions:**

- Import `loadPinnedManifest` and `isPinned` from `pinned-check.ts` in each archive handler:
  - `packages/forge/os/rfc/handlers/archive.ts`
  - `packages/forge/os/adr/handlers/archive.ts`
  - `packages/forge/os/plan/handlers/archive.ts`
  - `packages/forge/os/audit/handlers/archive.ts`
  - `packages/forge/os/session/handlers/archive.ts`
  - `packages/forge/os/mission/handlers/archive.ts`
- In each handler, before the `fs.rename` call for each file:
  1. Load manifest (cached per invocation — load once, reuse)
  2. Check if file path matches a pinned entry via `isPinned`
  3. If pinned: skip the file, emit warning to stderr: `⚠ pinned: skipping <path> (mode: freeze/protect)`
  4. Add to skipped list with reason "pinned"
  5. Continue with non-pinned files normally
- If manifest is missing (null), skip all pre-checks — behave as before

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Integration test: archive command skips pinned file, moves non-pinned file
- Integration test: archive command behaves as before when manifest is missing

**Completion criterion:** All 6 archive handlers call `isPinned` before `fs.rename`, skip pinned files with warning, and pass tests.

**Human review:** no

---

### Step 4. Unit and integration tests

**Goal:** Comprehensive test coverage for all acceptance criteria.

**Agent actions:**

- Create `packages/forge/src/tests/pinned-check.test.ts`:
  - `isPinned` matches file path exactly
  - `isPinned` matches directory path recursively (trailing `/`)
  - `isPinned` returns null for non-pinned path
  - `loadPinnedManifest` returns null when file missing
  - `loadPinnedManifest` parses valid YAML
  - `loadPinnedManifest` throws on malformed YAML
- Create `packages/forge/src/tests/pinned-validate.test.ts`:
  - Violation detected: delete freeze-mode file → violation with operation "delete"
  - Violation detected: move freeze-mode file → violation with operation "move"
  - Violation detected: modify freeze-mode file → violation with operation "modify"
  - No violation for modify on protect-mode file (only delete/move blocked)
  - Override passes: `--allow-pinned-override <path>` → status "pass", audit log written
  - Manifest missing → exit 0, status "pass", info message
  - Manifest malformed → exit 2
  - Manifest tampered (entries removed) → PINNED_MANIFEST_TAMPERED
  - `--json` output has correct shape (command, status, violations, overrides)
  - `--mode ci` checks last commit diff
- Create `packages/forge/src/tests/pinned-init.test.ts`:
  - Creates `.forge/pinned.yaml` with default entries
  - Installs pre-commit hook into `.git/hooks/pre-commit`
  - Appends to existing pre-commit hook with marker
  - Adds `.forge/pinned-audit.log` to `.gitignore`
  - `--ci` generates `.github/workflows/pinned-check.yml`
  - Idempotent: re-running merges defaults, preserves custom entries
- Create `packages/forge/src/tests/pinned-archive-integration.test.ts`:
  - `rfc.archive` skips pinned file, moves non-pinned file
  - `adr.archive` skips pinned file
  - Archive commands behave as before when manifest is missing
- Use temp directories with minimal git repos for test fixtures
- Use `fs.appendFile` atomic writes for audit log tests

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass
- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** All test files exist, all tests pass, no typecheck errors.

**Human review:** no

---

### Step 5. Documentation updates

**Goal:** Update AGENTS.md files and regenerate command manifest.

**Agent actions:**

- Update `packages/forge/AGENTS.md`:
  - Add section "Pinned-files protection" documenting:
    - `forge pinned.init` — creates manifest, installs hook, adds gitignore entry
    - `forge pinned.validate` — validates working tree against manifest
    - `.forge/` directory convention for forge-extension configs
    - Override policy: `--allow-pinned-override <path>` requires explicit operator instruction
    - Archive pre-check behavior: pinned files skipped with warning
    - Cross-platform note: hook script is `#!/bin/sh`, CI runs on ubuntu-latest
- Update root `AGENTS.md`:
  - Add `.forge/` to repository structure section (alongside `forge.yaml`)
  - Note that `.forge/pinned.yaml` is the pinned-files manifest (DNA-62)
- Regenerate command manifest: `pnpm exec werkstatt run command.manifest.generate`
- Verify `docs/architecture-dna.md` DNA-62 entry is correct (already added)

**Validation:**

- `git diff` shows updated AGENTS.md files and regenerated manifest
- `docs/command-manifest.generated.yaml` includes `pinned.validate` and `pinned.init`

**Completion criterion:** Both AGENTS.md files updated, command manifest regenerated with new commands.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (already done in Step 5).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Run verification:** `pnpm exec werkstatt run rfc.verification.emit --id RFC-0733` and commit the evidence file (RFC-0330).
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0733 --implementation-commit <sha>` (dry-run first, then without `--dry-run`).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0733`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0733`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0733`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0733`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0733` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0733.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0733` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on directory moves | Step 1: `--allow-pinned-override` with specific path, logged to audit |
| Manifest maintenance burden | Step 2: `pinned.init` merges defaults on re-run |
| Agent confusion about override | Step 5: AGENTS.md documents override requires operator instruction |
| Pre-commit hook bypass via `--no-verify` | Step 1: `--mode ci` checks last commit, CI catches bypass |
| Manifest tampering | Step 1: `PINNED_MANIFEST_TAMPERED` integrity check compares against HEAD |
| Performance | Step 0: manifest compiled to lookup map at load time, O(n) n<50 |
| Cross-platform hook installation | Step 2: hook script is `#!/bin/sh`, avoids POSIX-only constructs |
| Concurrent audit log appends | Step 1: `fs.appendFile` atomic per-line writes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1, DNA-42, or DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0733 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the `.forge/` directory convention conflicts with existing forge path resolution, escalate via ADR rather than hardcoding a workaround.
