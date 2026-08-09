---
rfcId: RFC-0606
planId: PLAN-RFC-0606-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-checks
  services: []
  docs: []
---

# Implementation Plan: RFC-0606

## 1. Objectives

- [ ] Objective 1 — Add `"systems/"` to `WORKSPACE_ABSOLUTE_PREFIXES` (maps to acceptance criterion 1)
- [ ] Objective 2 — Substitute `{system}` with `--site` value before glob expansion (maps to acceptance criterion 2)
- [ ] Objective 3 — `generated.files.validate` reports `GEN-FILES-01` for missing bordbuch files (maps to acceptance criterion 3)
- [ ] Objective 4 — `generated.files.validate` passes when bordbuch files exist (maps to acceptance criterion 4)
- [ ] Objective 5 — `generated.files.validate` without `--site` expands `{system}` to `*` (maps to acceptance criterion 5)
- [ ] Objective 6 — `rfc.validate` passes (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/generated-files-validate.ts` — `WORKSPACE_ABSOLUTE_PREFIXES` array (line 35): add `"systems/"`. `runGeneratedFilesValidate` function (line 156): add `{system}` → `app` substitution before `expandGlob` call.

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0606-*.md`
- No AGENTS.md updates needed — internal path resolution fix, no governance change.
- No `docs/*.xml` Compass files need sync — no repository-wide semantics changed.
- No `docs/architecture-dna.md` update — no new DNA invariant.

### 2.4 Validation and pipelines

- `generated.files.validate` is an existing command in the `build.check` pipeline. No pipeline wiring changes.
- No CI workflow changes.

## 3. Step sequence

### Step 1. Add `"systems/"` to `WORKSPACE_ABSOLUTE_PREFIXES`

**Goal:** Ensure `resolveEntryPath` resolves `systems/{system}/...` paths from `workspaceRoot` instead of falling through to `apps/<app>/`.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/generated-files-validate.ts` line 35-41: add `"systems/"` to the `WORKSPACE_ABSOLUTE_PREFIXES` array, between `"apps/"` and `".gitattributes"`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.

**Completion criterion:** `WORKSPACE_ABSOLUTE_PREFIXES` includes `"systems/"` and `isWorkspaceAbsolute("systems/foo/bar")` returns `true`.

**Human review:** no

---

### Step 2. Add `{system}` substitution in `runGeneratedFilesValidate`

**Goal:** Ensure `expandGlob` receives a concrete path with `{system}` replaced by the `--site` value (or `*` when no `--site` is provided), so the glob branch checks file existence on disk.

**Agent actions:**

- In `runGeneratedFilesValidate` (line 156), before the `hasGlobPattern` check (line 182), add `{system}` substitution:
  ```ts
  const expandedPath = posixPath.replace(/\{system\}/g, app ?? "*");
  ```
- Use `expandedPath` in place of `posixPath` for the `hasGlobPattern` check and `expandGlob` call.
- Keep `entry.path` (the original pattern with `{system}`) for diagnostic messages — it shows the registry-declared path, not the expanded one.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.

**Completion criterion:** When `--site warpgogol-com` is provided, `systems/{system}/public/.well-known/bordbuch.json` is expanded to `systems/warpgogol-com/public/.well-known/bordbuch.json` before glob expansion. When no `--site` is provided, `{system}` is replaced with `*`.

**Human review:** no

---

### Step 3. Add unit tests for `{system}` expansion

**Goal:** Verify that `generated.files.validate` correctly reports `GEN-FILES-01` for missing bordbuch files and passes when they exist.

**Agent actions:**

- Add tests to `packages/os/site-kernel-checks/src/tests/generated-files-validate.test.ts` (must be under `src/tests/` per vitest config):
  - **Red test**: create temp workspace with `systems/warpgogol-com/` directory but no bordbuch files. Run `runGeneratedFilesValidate` with `flags.site = "warpgogol-com"`. Assert `GEN-FILES-01` error is reported for `systems/warpgogol-com/public/.well-known/bordbuch.json`.
  - **Green test**: create temp workspace with `systems/warpgogol-com/public/.well-known/bordbuch.json` and `systems/warpgogol-com/public/.well-known/bordbuch/index.html`. Run `runGeneratedFilesValidate` with `flags.site = "warpgogol-com"`. Assert no `GEN-FILES-01` errors for bordbuch paths.
  - **Wildcard test**: run without `flags.site`. Assert `{system}` expands to `*` and `expandGlob` scans `systems/*/` directories.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass.

**Completion criterion:** All three tests pass. Red test confirms `GEN-FILES-01` fires for missing bordbuch files. Green test confirms no errors when files exist. Wildcard test confirms `*` expansion works without `--site`.

**Human review:** no

---

### Step 4. Run scoped build check and RFC validation

**Goal:** Verify the implementation passes typecheck and RFC mechanical validation.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`.
- Run `pnpm exec werkstatt run rfc.validate RFC-0606 --json`.

**Validation:**

- `build:check` exits 0.
- `rfc.validate` exits 0 with zero violations.

**Completion criterion:** Both commands pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md or Compass XML updates needed — internal fix with no governance or semantic changes.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they did not — `generated.files.validate` is already registered).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0606 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0606`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0606`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0606` in the subject line.
- Test file with red/green/wildcard cases for `{system}` expansion.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `expandGlob` does not handle `{placeholder}` brace patterns | Step 2 substitutes `{system}` before `expandGlob` is called, so `expandGlob` only sees concrete paths or `*` wildcards |
| `{id}` entries have the same issue | Out of scope (nonGoals). No mitigation in this plan — noted as known limitation in the RFC. |
| False negative → false positive transition | Step 3 tests verify both the error case (missing files → `GEN-FILES-01`) and the pass case (existing files → no errors) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0606 --reason "..." --invariant "DNA-N"` instead of working around it.
