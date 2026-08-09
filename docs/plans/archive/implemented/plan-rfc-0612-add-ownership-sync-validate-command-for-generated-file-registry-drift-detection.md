---
rfcId: RFC-0612
planId: PLAN-RFC-0612-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0612

## 1. Objectives

- [ ] Objective 1 — Implement `ownership.sync.validate` command handler with OWN-01 and OWN-02 diagnostics (maps to acceptance criteria 1-4)
- [ ] Objective 2 — Register command in command table and wire into pipelines (maps to acceptance criteria 1, 5, 6)
- [ ] Objective 3 — Reuse `STATIC_ASSET_EXEMPT_DIRS` and handle `conditional` entries (maps to acceptance criteria 7, 8)
- [ ] Objective 4 — Unit tests covering all diagnostic paths and exemptions (maps to acceptance criteria 2, 3, 7, 8, 9)
- [ ] Objective 5 — Documentation sync and RFC stamp (maps to acceptance criterion 10)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/ownership-sync-validate.ts` — **new module**: `runOwnershipSyncValidate` handler
- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — add import + command table entry
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — insert `ownership.sync.validate` before `generated.stale.validate` in `SITES_BUILD_PREPARE_PIPELINE`
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — insert `ownership.sync.validate` before `generated.stale.validate` in `SITES_CHECK_AUTHOR_PIPELINE`
- `packages/os/site-kernel-checks/src/generated-stale-validate.ts` — export `STATIC_ASSET_EXEMPT_DIRS` for reuse (currently module-private const)

### 2.2 Configuration and data

No configuration or data files affected. The command reads `GENERATOR_OWNERSHIP_MAP` (existing) and the filesystem.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add module table entry for `src/ownership-sync-validate.ts`
- RFC file (read-only reference — no modifications during implementation)

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — new step before `generated.stale.validate`
- `SITES_CHECK_AUTHOR_PIPELINE` — new step before `generated.stale.validate`
- No CI workflow changes needed (pipelines are consumed by existing CI)

## 3. Step sequence

### Step 1. Export `STATIC_ASSET_EXEMPT_DIRS` from `generated-stale-validate.ts`

**Goal:** Make the existing static-asset exemption list reusable by `ownership-sync-validate.ts` without duplicating it.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generated-stale-validate.ts`, change `const STATIC_ASSET_EXEMPT_DIRS` to `export const STATIC_ASSET_EXEMPT_DIRS`
- Verify no other module already exports this name

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `STATIC_ASSET_EXEMPT_DIRS` is exported and importable from `generated-stale-validate.ts`

**Human review:** no

---

### Step 2. Implement `ownership-sync-validate.ts` command handler

**Goal:** Create the new module implementing the `ownership.sync.validate` command with OWN-01 and OWN-02 diagnostics.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ownership-sync-validate.ts`
- Implement `runOwnershipSyncValidate(input, context): Promise<KernelCommandResult<CheckResult>>`
- Import `GENERATOR_OWNERSHIP_MAP` from `./generator-ownership.ts`
- Import `toPosix`, `isWorkspaceAbsolute`, `hasGlobPattern`, `resolveEntryPath`, `expandGlob` from `./generated-files-validate.ts`
- Import `STATIC_ASSET_EXEMPT_DIRS` from `./generated-stale-validate.ts`
- Import `diagnosticsResult` from `./result-helpers.ts`
- Import `collectFiles` from `@warpgogol/share/fs`
- **OWN-01 logic:** scan `public/` in the site directory, expand all `GENERATOR_OWNERSHIP_MAP` entry globs (with placeholder expansion including `{system}`), build a set of expected paths, report files not in the expected set and not in `STATIC_ASSET_EXEMPT_DIRS` as OWN-01 (severity: error)
- **OWN-02 logic:** for each non-conditional `GENERATOR_OWNERSHIP_MAP` entry, expand its glob; if no files match, report OWN-02 (severity: warning) with the entry path and command
- Skip `conditional: true` entries for OWN-02
- Use the same placeholder expansion as `generated.files.validate` (replace `{system}`, `{app}`, `{lang}`, `{route}`, `{slug}`, `{id}`, `{category}` with `*`)
- Return `diagnosticsResult("ownership.sync.validate", diagnostics)`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes (typecheck)

**Completion criterion:** Module compiles, exports `runOwnershipSyncValidate`, and follows the `CheckResult` + `Diagnostic[]` pattern

**Human review:** no

---

### Step 3. Register command in command table

**Goal:** Register `ownership.sync.validate` in the data-driven command table so it is discoverable by the kernel.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts`:
  - Add import: `import { runOwnershipSyncValidate } from "../ownership-sync-validate.ts";`
  - Add command entry after the `generated.stale.validate` entry:
    ```ts
    /* RFC-0612: ownership registry drift detection */
    {
      name: "ownership.sync.validate",
      description:
        "Detect files in public/ not covered by GENERATOR_OWNERSHIP_MAP (OWN-01) and entries matching no file (OWN-02) (RFC-0612).",
      scope: "workspace",
      flags: {
        app: { kind: "string", description: "App id for app-scoped path resolution." },
      },
      supportsAllSites: true,
      cacheable: false,
      execute: runOwnershipSyncValidate,
    },
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `pnpm exec site-kernel run ownership.sync.validate --site warpgogol-com --json` does not return "unknown command"

**Completion criterion:** Command is registered and callable via `site-kernel run`

**Human review:** no

---

### Step 4. Wire into pipelines

**Goal:** Insert `ownership.sync.validate` before `generated.stale.validate` in both pipelines.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`:
  - Add `{ command: "ownership.sync.validate" }` before `{ command: "generated.stale.validate" }` in `SITES_BUILD_PREPARE_PIPELINE`
  - Add CHANGE_SUMMARY entry: `<item>RFC-0612: added ownership.sync.validate before generated.stale.validate.</item>`
- In `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`:
  - Add `{ command: "ownership.sync.validate" }` before `{ command: "generated.stale.validate" }` in `SITES_CHECK_AUTHOR_PIPELINE`
  - Add CHANGE_SUMMARY entry: `<item>RFC-0612: added ownership.sync.validate before generated.stale.validate.</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** Both pipeline files contain `ownership.sync.validate` before `generated.stale.validate`

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create comprehensive unit tests covering OWN-01, OWN-02, static asset exemption, and conditional entry exemption.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/ownership-sync-validate.test.ts`
- Follow the test pattern from `generated-stale-validate.test.ts` (temp dirs, `createDefaultIO`, mock logger, `KernelRuntimeContext`)
- Test cases:
  1. **OWN-01 red:** file in `public/` not covered by any ownership entry → OWN-01 diagnostic, exitCode 1
  2. **OWN-01 green:** file covered by an ownership entry → no OWN-01
  3. **OWN-02 red:** ownership entry with glob matching no file → OWN-02 warning
  4. **OWN-02 green:** ownership entry matching files → no OWN-02
  5. **Static asset exemption:** file in `public/textures/` → no OWN-01 (exempt via `STATIC_ASSET_EXEMPT_DIRS`)
  6. **Conditional entry exemption:** `conditional: true` entry with no matching file → no OWN-02
  7. **Placeholder expansion:** entry with `{lang}` placeholder matches files in multiple language dirs → no OWN-01 for those files
  8. **Clean pass:** all files covered, all entries match → exitCode 0

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks test -- --run` passes with new tests

**Completion criterion:** All test cases pass

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Add module table entry for the new module.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`, add a row to the module table:
  ```
  | `src/ownership-sync-validate.ts` | RFC-0612 `runOwnershipSyncValidate` — detects files in public/ not covered by GENERATOR_OWNERSHIP_MAP (OWN-01) and entries matching no file (OWN-02). Diagnostics: OWN-01, OWN-02 |
  ```

**Validation:**

- Visual inspection — entry exists in the module table

**Completion criterion:** AGENTS.md module table includes the new entry

**Human review:** no

---

### Step 7. Run ecosystem manifest regeneration

**Goal:** Update `docs/ecosystem.generated.yaml` to reflect the new command surface.

**Agent actions:**

- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to regenerate the ecosystem manifest with the new command

**Validation:**

- `git diff docs/ecosystem.generated.yaml` shows the new command added

**Completion criterion:** Ecosystem manifest includes `ownership.sync.validate`

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0612 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0612`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0612`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test -- --run`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0612` in the subject line (RFC-0265 commit hygiene)
- Test output proving OWN-01 and OWN-02 diagnostics fire correctly

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for static assets | Step 1+2: reuse `STATIC_ASSET_EXEMPT_DIRS` from `generated-stale-validate.ts` |
| Placeholder expansion gaps | Step 2: use same `expandGlob` + placeholder expansion as `generated.files.validate` |
| Performance | Step 2: O(n×m) scan with ~400 files × ~60 entries — no optimization needed |
| Agent misinterpretation (OWN-01 vs STALE-01) | Step 2: distinct ruleId `OWN-01` vs `STALE-01`, different fix hints |
| Conditional entries trigger false OWN-02 | Step 2: skip `conditional: true` entries for OWN-02 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0612 --reason "..." --invariant "DNA-58"` instead of working around it.
