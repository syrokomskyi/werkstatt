---
rfcId: RFC-0574
planId: PLAN-RFC-0574-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ontology"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - "AGENTS.md"
    - "docs/architecture-dna.md"
    - "systems/registry.yaml"
---

# Implementation Plan: RFC-0574

## 1. Objectives

- [ ] O1 — Replace `repo:`/`mirror:` with `mirrors[]` in `fleetRegistryEntrySchema` (maps to acceptance criterion: `fleetRegistryEntrySchema uses mirrors[]`)
- [ ] O2 — Add `resolveMirrors()` helper and update all 13+ hardcoded path references (maps to acceptance criterion: `resolveMirrors() helper added and used by all files`)
- [ ] O3 — Implement star-topology sync in `sternsystem.sync` with post-receive hook removal (maps to acceptance criteria: `sternsystem.sync pushes from cache`, `post-receive hook deleted`)
- [ ] O4 — Add mirror topology validation rules to `sternsystem.validate` (maps to acceptance criterion: `sternsystem.validate enforces mirror topology rules`)
- [ ] O5 — Migrate `systems/registry.yaml` and physically relocate `systems/<id>/` (maps to acceptance criteria: `registry.yaml migrated`, `systems/<id>/ removed`)
- [ ] O6 — Update AGENTS.md, DNA-45 prose, and `sternsystem.register` flags (maps to acceptance criteria: `AGENTS.md updated`, `DNA-45 updated`, `sternsystem.register uses --mirrors`)

## 2. Affected artifacts

### 2.1 Code and commands

**Schema (`@warpgogol/ontology`):**

- `packages/ontology/src/operations/sternsystem.ts` — replace `repo`/`mirror` fields with `mirrors[]`, add `mirrorEntrySchema`, `mirrorStorageTypeSchema`, export new types
- `packages/ontology/src/operations/index.ts` — export `MirrorEntry`, `MirrorStorageType`
- `packages/ontology/src/tests/sternsystem-owner.test.ts` — update test fixtures to use `mirrors[]` instead of `repo`

**Path resolution (`@warpgogol/site-kernel-handoff`):**

- `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` — add `resolveMirrors()` helper
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` — star-topology sync, remove `ensureMirrorHook()` call, resolve from `mirrors[0].path`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` — new mirror topology validation rules
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` — 5 call sites, replace `--repo`/`--mirror` flags with `--mirrors`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts` — `cacheDir` from `mirrors[0].path`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts` — `systemDir` from `mirrors[0].path`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` — `systemDir` from `mirrors[0].path`
- `packages/os/site-kernel-handoff/src/sternsystem/mirror-hook.ts` — **delete file**
- `packages/os/site-kernel-handoff/src/sternsystem/index.ts` — update `writes`/`reads` fields: replace `systems/{id}/...` with `mirrors[0]/{id}/...` in command registrations
- `packages/os/site-kernel-handoff/src/bordbuch/index.ts` — update `writes`/`reads`: `systems/{system}/bordbuch/events.ndjson` → `mirrors[0]/{system}/bordbuch/events.ndjson`
- `packages/os/site-kernel-handoff/src/leitstand/index.ts` — update `writes`/`reads`: `systems/{system}/bordbuch/events.ndjson` → `mirrors[0]/{system}/bordbuch/events.ndjson` (2 commands)
- `packages/os/site-kernel-handoff/src/release/index.ts` — update `writes`/`reads`: `systems/{system}/bordbuch/events.ndjson` → `mirrors[0]/{system}/bordbuch/events.ndjson`
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — `syncCacheClone` and `systemDir` from `mirrors[0].path`
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — `runMissionReconcile`, `runMissionDiff` (3 call sites)
- `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — `pinPath` and `commitAndPushBordbuch` (2 call sites)
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — `commitAndPushBordbuch`
- `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` — `commitAndPushBordbuch`
- `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` — Bordbuch and pin paths (2 call sites)
- `packages/os/site-kernel-handoff/src/surface-contract.ts` — `siteDir` from `mirrors[0].path`

**Note:** `*.module.ts` files (e.g., `sternsystem.module.ts`, `bordbuch.module.ts`, `leitstand.module.ts`, `release.module.ts`) are dead code — not imported anywhere. Only `index.ts` files are canonical module definitions. Do not update `*.module.ts` files.

**Tests:**

- `packages/os/site-kernel-handoff/src/mission/rfc-0568-clone-reconcile.test.ts` — update `systems/test-system` paths to use mock `mirrors[0].path`
- New unit test file: `packages/os/site-kernel-handoff/src/sternsystem/resolve-mirrors.test.ts` — `resolveMirrors()` helper, protocol inference, relative path resolution
- New unit test file: `packages/os/site-kernel-handoff/src/sternsystem/mirror-validate.test.ts` — mirror topology validation rules (5 rules)
- New integration test file: `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync-integration.test.ts` — real git operations (clone, push, bundle, remote add) between temporary mirror directories

### 2.2 Configuration and data

- `systems/registry.yaml` — convert `repo:`/`mirror:` to `mirrors[]` for warpgogol-com entry
- Physical move: `systems/warpgogol-com/` → `../systems-cache/warpgogol-com/` (outside monorepo)
- Update `origin` git remote in cache clone after physical move

### 2.3 Documentation and specs

- `AGENTS.md` — update "Monorepo layout" section, "External mirror sync" section, add mirror rule
- `docs/architecture-dna.md` — update DNA-45 entry to list `mirrors[]` instead of `repo`/`mirror`
- `docs/rfcs/archive/implemented/rfc-0354-*.md` — already updated `amendedBy` during enhance

### 2.4 Validation and pipelines

- `sternsystem.validate` runs in `build.check` — new mirror topology rules are additional checks
- No pipeline changes needed

## 3. Step sequence

### Step 1. All code changes — schema, path resolution, sync, validate, register, docs (single commit)

**Goal:** Replace `repo:`/`mirror:` with `mirrors[]` in schema, add `resolveMirrors()` helper, update all path references, implement star-topology sync, add validation rules, update register flags, update module `writes`/`reads`, migrate `registry.yaml`, update AGENTS.md and DNA-45. All code changes in **one commit** to keep schema and registry synchronized.

**Agent actions:**

**1a. Schema (`@warpgogol/ontology`):**

- Add `mirrorStorageTypeSchema = z.enum(["non-bare", "bare", "bundle"])` to `packages/ontology/src/operations/sternsystem.ts`
- Add `mirrorEntrySchema = z.object({ path: z.string().min(1), storageType: mirrorStorageTypeSchema })`
- Replace `repo` and `mirror` fields with `mirrors: z.array(mirrorEntrySchema).min(1)`
- Remove `repoRe` (only used in this file, 3 references)
- Export `MirrorEntry`, `MirrorStorageType` types and schemas
- Update `packages/ontology/src/operations/index.ts` exports
- Update `packages/ontology/src/tests/sternsystem-owner.test.ts` fixtures

**1b. Path resolution (`@warpgogol/site-kernel-handoff`):**

- Add `resolveMirrors()` and `MirrorResolution` to `registry-io.ts`
- Add protocol inference helper (file/ssh/https/ftp/s3/rsync)
- Update all 13+ files listed in §2.1 to use `resolveMirrors()`
- Update `writes`/`reads` in `sternsystem/index.ts`, `bordbuch/index.ts`, `leitstand/index.ts`, `release/index.ts`: `systems/{id}/...` → `mirrors[0]/{id}/...`
- Delete `mirror-hook.ts`
- Remove `ensureMirrorHook()` imports/calls from `sternsystem-sync.ts` and `sternsystem-register.ts`
- Update `mission/rfc-0568-clone-reconcile.test.ts` paths

**1c. Star-topology sync:**

- Rewrite `sternsystem-sync.ts` to iterate `mirrors[1..N]`
- Git-accessible mirrors: `git push` from cache
- `bundle` storageType: `git bundle create` + file copy
- Acquire `system:<id>` lock before touching cache
- Per-mirror failures non-fatal

**1d. Mirror validation:**

- Add 5 rules to `sternsystem-validate.ts`: `mirror-empty`, `mirror-first-not-non-bare`, `mirror-not-found`, `mirror-bundle-git-protocol`, `mirror-credentials` (retained)
- Remove old `mirror-remote-mismatch`, `mirror-remote-missing` rules

**1e. Register flags:**

- Replace `--repo`/`--mirror` with `--mirrors` in `sternsystem-register.ts`
- Update `sternsystem/index.ts` command registration

**1f. Registry migration:**

- Rewrite `systems/registry.yaml` entry for warpgogol-com to use `mirrors[]`

**1g. Documentation:**

- Update AGENTS.md (Monorepo layout, External mirror sync, mirror rule)
- Update `docs/architecture-dna.md` DNA-45 entry

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/ontology run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec werkstatt run rfc.validate RFC-0574 --json`

**Completion criterion:** All code changes in one commit. Schema uses `mirrors[]`, all path references use `resolveMirrors()`, sync uses star topology, validation enforces 5 mirror rules, register uses `--mirrors`, registry.yaml migrated, AGENTS.md and DNA-45 updated. All tests pass.

**Human review:** no

---

### Step 2. Physical relocation (second commit)

**Goal:** Move `systems/warpgogol-com/` to `../systems-cache/warpgogol-com/` and update git remotes.

**Agent actions:**

- Move `systems/warpgogol-com/` to `../systems-cache/warpgogol-com/` (physical relocation)
- Update `origin` git remote in cache clone: `git remote set-url origin ../systems-git/warpgogol-com` (relative path changed)
- Remove `systems/warpgogol-com/` from monorepo tracking
- Update `.gitignore` if `systems-cache/` needs to be ignored

**Validation:**

- `pnpm exec werkstatt run sternsystem.validate --id warpgogol-com --json`
- `git status` — `systems/warpgogol-com/` no longer tracked

**Completion criterion:** `systems/warpgogol-com/` is physically at `../systems-cache/warpgogol-com/`. `sternsystem.validate` passes. `origin` remote points to correct relative path.

**Human review:** yes — physical relocation of git repos is a destructive operation. Operator must verify the move succeeded before proceeding.

---

### Step 3. Add unit and integration tests (third commit)

**Goal:** Add unit tests for `resolveMirrors()` and mirror validation, plus integration tests with real git operations for star-topology sync.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/sternsystem/resolve-mirrors.test.ts`:
  - Test `resolveMirrors()` with single mirror (non-bare only)
  - Test `resolveMirrors()` with multiple mirrors (non-bare + bare + external)
  - Test `resolveMirrors()` with bundle storageType mirrors
  - Test protocol inference from path strings (file, ssh, https, ftp, s3, rsync)
  - Test `resolveMirrors()` with relative paths (resolved against workspaceRoot)
- Create `packages/os/site-kernel-handoff/src/sternsystem/mirror-validate.test.ts`:
  - Test all 5 mirror validation rules
- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync-integration.test.ts`:
  - Set up temporary directory structure with real git repos (cache clone, bare mirror, external mirror)
  - Test star-topology sync: push from cache to bare mirror
  - Test `git bundle` creation and copy to bundle mirror
  - Test per-mirror failure handling (non-fatal)
  - Test lock acquisition before sync

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All new tests pass. `resolveMirrors()`, mirror validation, and star-topology sync have full test coverage including real git operations.

**Human review:** no

---

### Final Step. Review, fix, and acceptance criteria verification

**Goal:** Run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/ontology run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/ontology run test`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec werkstatt run rfc.validate RFC-0574 --json`
- Run `pnpm exec werkstatt run sternsystem.validate --json`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0574 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0574`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0574`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/ontology run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec werkstatt run sternsystem.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0574` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Path resolution breakage (13+ files) | Step 1 enumerates every call site; `resolveMirrors()` centralizes resolution |
| Migration complexity | Step 1 — atomic migration with `sternsystem.validate` before and after |
| Backup mirror reliability | Step 1 — per-mirror failures are non-fatal in `sternsystem.sync` |
| Agent misinterpretation | Step 1 — AGENTS.md rule says "any Sternsystem mirror" |
| Single point of failure | Step 1 — cache clone is recreatable from any bare mirror via `git clone` |
| Protocol inference ambiguity | Step 3 — unit tests cover all protocol inference cases |
| Concurrent sync and materialize | Step 1 — `sternsystem.sync` acquires `system:<id>` lock |
| Origin remote path change | Step 2 — `git remote set-url origin` is part of physical relocation |
| Bordbuch path relocation | Step 1 — all `commitAndPushBordbuch` calls updated to use `mirrors[0].path` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44, DNA-45, DNA-46, or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0574 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the physical relocation of `systems/warpgogol-com/` fails (git corruption, broken origin), stop and report to the operator — do not attempt to recover programmatically.
