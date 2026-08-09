---
rfcId: RFC-0704
planId: PLAN-RFC-0704-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - forge
    - site-kernel-checks
  services: []
  docs:
    - AGENTS.md
    - forge.yaml
---

# Implementation Plan: RFC-0704

## 1. Objectives

- [ ] Objective 1 — `forge.yaml` schema accepts `independentVersionPackages` field (maps to acceptance criterion 1)
- [ ] Objective 2 — `independentVersionPackages: [packages/forge]` declared in `forge.yaml` (maps to acceptance criterion 2)
- [ ] Objective 3 — `ecosystem.commit` skips root version bump and version log write when all staged platform files are in `independentVersionPackages` (maps to acceptance criterion 3)
- [ ] Objective 4 — `ecosystem.commit` performs normal bump when at least one staged file is outside `independentVersionPackages` (maps to acceptance criterion 4)
- [ ] Objective 5 — `ecosystem.commit` emits warning for invalid paths in `independentVersionPackages` (maps to acceptance criterion 5)
- [ ] Objective 6 — `forge.doctor` validates `independentVersionPackages` paths exist (maps to acceptance criterion 6)
- [ ] Objective 7 — Root `AGENTS.md` documents the independent version package contract (maps to acceptance criterion 7)
- [ ] Objective 8 — Unit tests cover skip-bump, mixed-files, and invalid-path scenarios (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — add `independentVersionPackages` to `forgeConfigSchema` and `ForgeConfig` interface
- `packages/os/site-kernel-checks/src/ecosystem-commit.ts` — add independent-package detection logic, skip-bump path, warning emission for invalid paths
- `packages/forge/src/onboarding/doctor.ts` — add `independentVersionPackages` path validation check
- `packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts` — add test cases for skip-bump, mixed-files, invalid-path

### 2.2 Configuration and data

- `forge.yaml` — add `independentVersionPackages: [packages/forge]` field

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update "Platform-scope commit discipline (RFC-0703)" section with independent-version package contract

### 2.4 Validation and pipelines

- No pipeline changes required — `ecosystem.commit` behavior change only
- `rfc.validate --id RFC-0704` must pass before stamping
- `pnpm --filter @warpgogol/forge run build:check` must pass
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` must pass
- `pnpm --filter @warpgogol/site-kernel-checks run test` must pass (includes new ecosystem-commit tests)

## 3. Step sequence

### Step 1. Extend forge.yaml schema with `independentVersionPackages`

**Goal:** Add the `independentVersionPackages` field to the forge config schema so `forge.yaml` can declare packages with autonomous npm versions.

**Agent actions:**

- Add `independentVersionPackages: z.array(z.string()).optional()` to `forgeConfigSchema` in `packages/forge/src/config/forge-config.ts`
- Add `independentVersionPackages?: string[]` to `ForgeConfig` interface
- Add CHANGE_SUMMARY entry for RFC-0704

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `forgeConfigSchema` accepts `independentVersionPackages` field; TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Add `independentVersionPackages` to `forge.yaml`

**Goal:** Declare `packages/forge` as an independent-version package in the project config.

**Agent actions:**

- Add `independentVersionPackages:` list with `- packages/forge` to `forge.yaml` at the root level (after `skillPacks` or at the end of the file)

**Validation:**

- `pnpm exec werkstatt run forge.doctor` does not report errors about the new field
- `forge.yaml` is valid YAML

**Completion criterion:** `forge.yaml` contains `independentVersionPackages: [packages/forge]`; `forge.doctor` passes.

**Human review:** no

---

### Step 3. Implement skip-bump logic in `ecosystem.commit`

**Goal:** Modify `runEcosystemCommit` to detect when all staged platform files belong to `independentVersionPackages` and skip the root version bump, version log write, and platform trailers.

**Agent actions:**

- Add a helper function `isIndependentPackage(filePath: string, independentPackages: string[]): boolean` that checks `filePath.startsWith(pkgPath + "/")` for each package in the list (prevents false positives on `packages/forge-os/`)
- Add a helper function `loadIndependentVersionPackages(workspaceRoot: string): { packages: string[]; invalidPaths: string[] }` that reads `forge.yaml` directly via `fs.readFile` + `yaml.parse` (same pattern as the existing `readRfcVersionBump` helper in the same file — `site-kernel-checks` must NOT import from `@warpgogol/forge`). Extracts `independentVersionPackages`, validates each path exists and contains a `package.json`. Returns invalid paths for warning emission.
- In `runEcosystemCommit`, after getting `platformStaged` files:
  - Load `independentVersionPackages` from `forge.yaml`
  - Check if ALL `platformStaged` files belong to at least one independent package (using `startsWith(pkgPath + "/")`)
  - If yes and no invalid paths: set `skipPlatformBump = true`, `bumpType = "none"`, skip version bump, skip version log write, skip platform trailers, still commit via `ECOSYSTEM_COMMIT=1`
  - If yes but some paths are invalid: emit warning, proceed with normal bump
  - If no (at least one file outside independent packages): proceed with normal bump
- Extend `EcosystemCommitResult.bumpType` to include `"none"`
- Add `skipPlatformBump?: boolean` to `EcosystemCommitResult`
- Add `warnings?: string[]` to `EcosystemCommitResult` for invalid-path warnings
- In the skip path: do NOT read or modify root `package.json`, do NOT write `platform-version-log.generated.yaml`, do NOT add `X-Platform-Bump` / `X-Platform-Version` trailers. Commit with just the operator's message via `ECOSYSTEM_COMMIT=1`.
- Add CHANGE_SUMMARY entry for RFC-0704

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `runEcosystemCommit` skips version bump when all staged platform files are in `independentVersionPackages`; normal bump occurs otherwise; invalid paths emit warnings.

**Human review:** no

---

### Step 4. Add `forge.doctor` validation for `independentVersionPackages`

**Goal:** `forge.doctor` validates that each path in `independentVersionPackages` exists and contains a `package.json`.

**Agent actions:**

- Add a new check function `checkIndependentVersionPackages(workspaceRoot: string): Promise<DoctorCheck>` in `packages/forge/src/onboarding/doctor.ts`
- The function reads `forge.yaml`, gets `independentVersionPackages`, for each path:
  - Check if directory exists
  - Check if `package.json` exists in the directory
  - Report missing paths as warnings
- Add the check to the `checks` array in `runDoctor`
- Add CHANGE_SUMMARY entry for RFC-0704

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `forge.doctor` reports the new check

**Completion criterion:** `forge.doctor` includes `independent-version-packages` check that validates paths exist and contain `package.json`.

**Human review:** no

---

### Step 5. Update root AGENTS.md with independent-version package contract

**Goal:** Document the independent version package contract in the "Platform-scope commit discipline" section of root `AGENTS.md`.

**Agent actions:**

- Find the "Platform-scope commit discipline (RFC-0703)" section in root `AGENTS.md`
- Add a subsection or paragraph documenting:
  - `independentVersionPackages` in `forge.yaml` declares packages with autonomous npm versions
  - `ecosystem.commit` automatically skips platform version bump when ALL staged platform files belong to independent packages
  - Mixed commits (files in both independent and non-independent packages) still trigger a platform bump
  - Agents MUST still use `ecosystem.commit` for ALL `packages/**` changes — no manual `ECOSYSTEM_COMMIT=1`
  - Path matching uses `startsWith(pkgPath + "/")` — `packages/forge` does NOT match `packages/forge-os`
  - Reference RFC-0704

**Validation:**

- `AGENTS.md` is valid markdown
- The new content is in the "Platform-scope commit discipline" section

**Completion criterion:** Root `AGENTS.md` documents the independent version package contract with clear agent behavioral rules.

**Human review:** no

---

### Step 6. Add unit tests for skip-bump, mixed-files, and invalid-path scenarios

**Goal:** Comprehensive test coverage for the new `ecosystem.commit` behavior.

**Agent actions:**

- Add test cases to `packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts`:
  - **Skip-bump test:** stage files only in `packages/forge/`, set `independentVersionPackages: [packages/forge]` in `forge.yaml`, verify `skipPlatformBump: true`, `bumpType: "none"`, `newVersion === previousVersion`, no `X-Platform-Bump` trailer, no `platform-version-log.generated.yaml` written
  - **Mixed-files test:** stage files in both `packages/forge/` and `packages/dummy/`, set `independentVersionPackages: [packages/forge]`, verify normal bump occurs (`skipPlatformBump: false`, `bumpType: "patch"`, version incremented, trailers present)
  - **Invalid-path test:** set `independentVersionPackages: [packages/nonexistent]`, stage files in `packages/forge/`, verify warning emitted, normal bump occurs
  - **Path matching test:** stage file in `packages/forge-os/`, set `independentVersionPackages: [packages/forge]`, verify normal bump occurs (prefix does not match)
  - **No independentVersionPackages test:** no `independentVersionPackages` in `forge.yaml`, stage files in `packages/forge/`, verify normal bump occurs (backward compatible)
- Each test needs a temp workspace with `forge.yaml` — extend `setupWorkspace` or create a new helper

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` passes with all new test cases

**Completion criterion:** All 5 test scenarios pass; test file covers skip-bump, mixed-files, invalid-path, path-matching, and backward-compatible cases.

**Human review:** no

---

### Step 7. Run validation suite

**Goal:** Verify all acceptance criteria are met and the RFC can be stamped as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0704` — must pass
- Run `pnpm --filter @warpgogol/forge run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` — must pass
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they did not — skip)
- Check off each acceptance criterion in the RFC with evidence

**Validation:**

- All commands exit 0
- All acceptance criteria in RFC-0704 are verifiable against the implementation

**Completion criterion:** All validation commands pass; every acceptance criterion has been verified with evidence.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify root `AGENTS.md` is updated with independent-version package contract (Step 5)
- Verify `forge.yaml` declares `independentVersionPackages` (Step 2)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no changes — skip)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0704 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0704 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0704`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0704`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0704` (RFC-0330 — no acceptance probes declared, so this will skip, but run for compliance)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0704` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation — agents think ALL `packages/forge` changes skip bump | Step 5 documents mixed-files rule in AGENTS.md; Step 6 tests mixed-files scenario |
| Stale list entries — package removed but stays in list | Step 4 adds `forge.doctor` validation for path existence |
| Path matching false positives — `packages/forge-os` matches `packages/forge` | Step 3 uses `startsWith(pkgPath + "/")`; Step 6 tests path matching |
| PC-02/PC-03 stale log interaction | Step 3 skips log write only when no platform code changed; log stays at last real platform version |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0704 --reason "..." --invariant "DNA-53"` instead of working around it.
