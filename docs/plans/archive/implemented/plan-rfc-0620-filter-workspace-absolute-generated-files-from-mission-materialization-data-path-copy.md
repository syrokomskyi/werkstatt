---
rfcId: RFC-0620
planId: PLAN-RFC-0620-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - docs/rfcs/rfc-0620-filter-workspace-absolute-generated-files-from-mission-materialization-data-path-copy.md
---

# Implementation Plan: RFC-0620

## 1. Objectives

- [ ] Objective 1 — Re-export `GENERATOR_OWNERSHIP_MAP` and `OwnershipEntry` from `@warpgogol/site-kernel-checks` main entry point (maps to acceptance criterion 1)
- [ ] Objective 2 — Add ownership-map-driven filter to `public/` copy in `mission.materialize`, replacing the hardcoded bordbuch hotfix (maps to acceptance criterion 1)
- [ ] Objective 3 — Verify `ownership.sync.validate` passes with zero OWN-01 diagnostics for bordbuch files (maps to acceptance criterion 2)
- [ ] Objective 4 — Verify no workspace-absolute generated files appear in the workpiece after materialization (maps to acceptance criterion 3)
- [ ] Objective 5 — Add regression test proving the filter is ownership-map-driven, not hardcoded (maps to acceptance criteria 4 and 5)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0620 before merging (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/index.ts` — add re-export of `GENERATOR_OWNERSHIP_MAP` and `OwnershipEntry` type
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — add `getWorkspaceAbsoluteGeneratedPaths()` function, modify `copyDir` for `public/` to accept a skip set, replace hardcoded bordbuch removal (lines 782–797) with ownership-map-driven filter

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0620-*.md` — read-only reference (acceptance criteria checked off during final step)
- No `AGENTS.md` changes needed (RFC states: "No AGENTS.md change is needed — the behavior is transparent to agents")
- No `docs/*.xml` Compass files affected (no repository-wide semantics change)
- No `docs/architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- No pipeline definition changes (filtering happens before pipeline runs)
- No CI workflow changes
- No new or changed validate commands

## 3. Step sequence

### Step 1. Re-export GENERATOR_OWNERSHIP_MAP from site-kernel-checks

**Goal:** Make `GENERATOR_OWNERSHIP_MAP` and `OwnershipEntry` importable from `@warpgogol/site-kernel-handoff` via the main entry point.

**Agent actions:**

- Add `export { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";` to `packages/os/site-kernel-checks/src/index.ts`
- Add `export type { OwnershipEntry } from "./generator-ownership.ts";` to `packages/os/site-kernel-checks/src/index.ts`
- Verify no circular dependency is introduced (site-kernel-handoff already imports from site-kernel-checks)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes (verifies the import resolves)

**Completion criterion:** `GENERATOR_OWNERSHIP_MAP` is importable from `@warpgogol/site-kernel-checks` without a subpath, and both packages typecheck.

**Human review:** no

---

### Step 2. Add ownership-map-driven filter to mission.materialize

**Goal:** Replace the hardcoded bordbuch file removal with a self-maintaining, ownership-map-driven filter that excludes all workspace-absolute generated files from all `STERNSYSTEM_DATA_PATHS` copies.

**Agent actions:**

- Add `import { GENERATOR_OWNERSHIP_MAP } from "@warpgogol/site-kernel-checks";` to `mission-materialize.ts` (alongside the existing import from line 59)
- Add `getWorkspaceAbsoluteGeneratedPaths(systemId: string): Set<string>` function to `mission-materialize.ts`:
  - Iterate `GENERATOR_OWNERSHIP_MAP` entries
  - Filter entries where `entry.path.startsWith("systems/" + systemId + "/")`
  - Strip the `systems/{system}/` prefix to get the relative path within the cache clone (e.g., `public/.well-known/bordbuch.json`)
  - Return as `Set<string>`
- Modify the `STERNSYSTEM_DATA_PATHS` copy loop (lines 742–754) to filter all data paths, not just `public/`:
  - Before the loop, call `getWorkspaceAbsoluteGeneratedPaths(manifest.systemId)` to build the global skip set (paths relative to cache clone root)
  - Modify `copyDir` to accept an optional `skipPaths: Set<string>` parameter (paths relative to the `src` directory of `copyDir`)
  - For each data path, filter the global skip set to entries starting with `dataPath + "/"`, strip the `dataPath + "/"` prefix, and pass the resulting set to `copyDir`
  - This ensures workspace-absolute generated files are excluded from all data-path copies (src/content, public, provenance), not just `public/`
- Remove the hardcoded bordbuch removal block (lines 782–797) — it is superseded by the filter
- Add a code comment referencing RFC-0620 explaining why workspace-absolute generated files are filtered

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Manual code review: verify the skip set prefix stripping is correct — ownership map paths are `systems/{system}/public/.well-known/bordbuch.json`, stripped to `public/.well-known/bordbuch.json` (relative to cache clone root). For each data path (e.g., `public`), the skip set is filtered to entries starting with `public/` and the `public/` prefix is stripped, yielding `.well-known/bordbuch.json` (relative to the `copyDir` src directory). `copyDir` checks each file's relative path against this set.

**Completion criterion:** The hardcoded bordbuch removal is deleted, and all `STERNSYSTEM_DATA_PATHS` copies use `GENERATOR_OWNERSHIP_MAP` to skip workspace-absolute generated files. Both packages typecheck.

**Human review:** no

---

### Step 3. Add regression test

**Goal:** Verify that workspace-absolute generated files are excluded from the workpiece after materialization, and that the filter is driven by the ownership map (not hardcoded paths).

**Agent actions:**

- Create test file in `packages/os/site-kernel-handoff/src/tests/` (check `vitest.config.ts` for include patterns — tests must be under `src/tests/`)
- Test scenario 1: set up a temp cache clone with `public/.well-known/bordbuch.json` and `public/.well-known/bordbuch/index.html` in the cache clone, run the materialize copy step, verify these files are absent from the workpiece
- Test scenario 2: add a mock entry to `GENERATOR_OWNERSHIP_MAP` (or mock the import) with a `systems/{system}/public/test-generated.json` path, place that file in the cache clone, verify it is filtered
- Test scenario 3: verify authored files in `public/` (e.g., `public/textures/logo.svg`) ARE copied to the workpiece
- Use the mocking pattern from existing mission-materialize tests (mock `@warpgogol/site-kernel`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-checks` as needed)
- Include `logger: { info: () => {} }` in test context
- Include `i18n: { default: de, languages: [de] }` in test `system.md` frontmatter
- Add `pnpm-workspace.yaml` with `packages: []` to temp workspace

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes
- Test file is discovered by vitest (under `src/tests/`)

**Completion criterion:** Regression test passes and covers all three scenarios (bordbuch filtered, mock entry filtered, authored files preserved).

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify no `AGENTS.md` updates are needed (RFC explicitly states this)
- Verify no `docs/*.xml` Compass files need updates (no repository-wide semantics change)
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0620` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test` — must pass
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0620 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0620` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with inline evidence; code review passed; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0620`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0620` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive filtering — authored file matches workspace-absolute path | Step 2: filter only matches `systems/{system}/` prefixed paths from `GENERATOR_OWNERSHIP_MAP`, which are generated artifacts, not authored content |
| Glob pattern support — future entries may use globs | Step 2: current implementation handles concrete paths only; documented as future concern in RFC. No glob entries exist currently. |
| Performance impact | Step 2: O(1) per file check against a `Set<string>` built from 2 entries. Negligible. |
| Agent confusion — bordbuch files missing from workpiece | Step 2: code comment referencing RFC-0620 explains the rationale |
| Regression — future refactor removes filtering | Step 3: regression test verifies workspace-absolute generated files are absent |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 or DNA-47, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0620 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `GENERATOR_OWNERSHIP_MAP` re-export introduces a circular dependency between `site-kernel-checks` and `site-kernel-handoff`, stop and reassess — the import may need to be restructured (e.g., extract the map to a shared package).
