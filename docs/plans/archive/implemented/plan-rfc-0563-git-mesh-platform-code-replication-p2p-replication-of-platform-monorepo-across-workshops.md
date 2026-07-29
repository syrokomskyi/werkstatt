---
rfcId: RFC-0563
planId: PLAN-RFC-0563-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel
  services: []
  docs:
    - packages/os/site-kernel/AGENTS.md
    - docs/technology.xml
    - docs/development-plan.xml
---

# Implementation Plan: RFC-0563

## 1. Objectives

- [ ] Objective 1 — Define `GitMeshConfig`, `GitMeshRemote`, `GitMeshSyncResult`, `GitMeshStatus`, `GitMeshVerifyResult` types — maps to acceptance criterion [types defined]
- [ ] Objective 2 — Implement `gitmesh.sync` command with convergence algorithm, lock, auto-config bootstrap — maps to acceptance criterion [sync fetches and converges] + [pull-only] + [config schema]
- [ ] Objective 3 — Implement `gitmesh.status` command as local-only query — maps to acceptance criterion [status reports SHA/behind/ahead/lastSync]
- [ ] Objective 4 — Implement `gitmesh.verify` command with incremental verification — maps to acceptance criterion [verify against operator public key] + [reports unsigned/invalid/total]
- [ ] Objective 5 — Define and validate `werkstatt.gitmesh.json` config schema — maps to acceptance criterion [config schema defined and validated]
- [ ] Objective 6 — Register gitmesh module in `tools/kernel.config.ts` — maps to acceptance criterion [commands registered]
- [ ] Objective 7 — Update documentation (AGENTS.md, Compass XML) — maps to acceptance criterion [rfc.validate passes] + implementation notes

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/gitmesh/types.ts` — new file: all TypeScript interfaces
- `packages/os/site-kernel/src/gitmesh/sync.ts` — new file: `gitmesh.sync` handler
- `packages/os/site-kernel/src/gitmesh/status.ts` — new file: `gitmesh.status` handler
- `packages/os/site-kernel/src/gitmesh/verify.ts` — new file: `gitmesh.verify` handler
- `packages/os/site-kernel/src/gitmesh/gitmesh-module.ts` — new file: `KernelModule` registration
- `packages/os/site-kernel/src/gitmesh/config.ts` — new file: config loading, validation, auto-creation from `.git/config`
- `packages/os/site-kernel/src/gitmesh/git-ops.ts` — new file: low-level git operations (fetch, merge --ff-only, fsck, log, rev-parse)
- `packages/os/site-kernel/src/index.ts` — export `gitmeshModule` and types
- `tools/kernel.config.ts` — add `gitmesh` module loader

### 2.2 Configuration and data

- `werkstatt.gitmesh.json` — new config file (auto-created in Phase 1, operator-edited in Phase 2+)
- `werkstatt.identity.json` — existing file (from RFC-0558), read by `gitmesh.verify` for public key
- `.git/gitmesh.lock` — lock file (runtime, gitignored)

### 2.3 Documentation and specs

- `packages/os/site-kernel/AGENTS.md` — add `gitmesh/` section
- `docs/technology.xml` — add git-mesh subsystem to P2P topology section
- `docs/development-plan.xml` — add git-mesh to development plan if applicable

### 2.4 Validation and pipelines

- No pipeline changes — gitmesh commands are standalone workspace-scoped commands, not part of `build.check` or `build.prepare`
- `rfc.validate RFC-0563` — must pass after implementation
- `pnpm --filter @warpgogol/site-kernel build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel test` — unit tests

## 3. Step sequence

### Step 1. Define TypeScript types and config schema

**Goal:** Create the type contracts that all three commands depend on.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/types.ts` with `GitMeshConfig`, `GitMeshRemote`, `GitMeshSyncResult`, `GitMeshStatus`, `GitMeshVerifyResult` interfaces exactly as specified in the RFC
- Create `packages/os/site-kernel/src/gitmesh/config.ts` with:
  - `loadGitMeshConfig(workspaceRoot: string): Promise<GitMeshConfig>` — reads `werkstatt.gitmesh.json`, throws on invalid schema
  - `autoCreateConfigFromGit(workspaceRoot: string): Promise<GitMeshConfig>` — reads `.git/config` remotes, creates `werkstatt.gitmesh.json` with all existing remotes as `trusted: true`, `trackedBranch: "main"`, `syncIntervalMs: 0`, `verifySignatures: false`
  - `validateConfig(config: unknown): asserts config is GitMeshConfig` — runtime validation
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding to both files (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check` passes with new files

**Completion criterion:** `types.ts` and `config.ts` exist, compile, and export all five interfaces plus config loading functions.

**Human review:** no

---

### Step 2. Implement git operations layer

**Goal:** Create the low-level git operations module that sync/status/verify depend on.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/git-ops.ts` with:
  - `gitFetch(remote: string, branch: string, cwd: string): Promise<void>` — `git fetch <remote> <branch>`
  - `gitMergeFfOnly(commitSha: string, cwd: string): Promise<void>` — `git merge --ff-only <sha>`
  - `gitFsck(cwd: string): Promise<boolean>` — `git fsck --no-dangling`, returns true if clean
  - `gitRevParseHead(cwd: string): Promise<string>` — `git rev-parse HEAD`
  - `gitRevParseRemote(remote: string, branch: string, cwd: string): Promise<string>` — `git rev-parse refs/remotes/<remote>/<branch>`
  - `gitLogCommits(fromSha: string, toSha: string, cwd: string): Promise<CommitInfo[]>` — `git log --format=... <from>..<to>`
  - `gitCommitTimestamp(sha: string, cwd: string): Promise<number>` — `git log -1 --format=%ct <sha>`
  - `gitIsAncestor(ancestor: string, descendant: string, cwd: string): Promise<boolean>` — `git merge-base --is-ancestor`
  - `gitHasUncommittedChanges(cwd: string): Promise<boolean>` — `git status --porcelain`
  - `gitRemoteList(cwd: string): Promise<{ name: string; url: string }[]>` — `git remote -v` parsed
  - `gitRemoteAdd(name: string, url: string, cwd: string): Promise<void>`
  - `gitRemoteSetUrl(name: string, url: string, cwd: string): Promise<void>`
- All functions use `node:child_process` `execFile` with `git` binary, 6-minute timeout
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check` passes

**Completion criterion:** `git-ops.ts` exists, compiles, and exports all listed functions.

**Human review:** no

---

### Step 3. Implement `gitmesh.sync` command

**Goal:** Create the sync handler with convergence algorithm, lock, and auto-config bootstrap.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/sync.ts` with `runGitMeshSync` handler:
  1. Acquire lock file `.git/gitmesh.lock` (fail with `sync-in-progress` if already held)
  2. Load config: try `werkstatt.gitmesh.json`, if missing auto-create from `.git/config`
  3. Run `git fsck` — fail with `clone-corrupted` if corruption detected
  4. Check uncommitted changes — fail with `uncommitted-changes` if dirty
  5. For each remote in config: `git fetch <remote> <trackedBranch>`, log warnings for unreachable remotes
  6. If all remotes unreachable: fail with `all-remotes-unreachable`
  7. Among reachable remote-tracking branches, find commit with highest committer timestamp
  8. If `verifySignatures: true`: verify signature on latest commit, fail with `signature-invalid` if invalid
  9. Check if latest is descendant of HEAD (`git merge-base --is-ancestor`): if not, fail with `non-fast-forward`
  10. `git merge --ff-only <latest-sha>`
  11. Return `GitMeshSyncResult` with `synced`, `fromRemote`, `commitsReceived`, `currentSha`, `signaturesVerified`, `signaturesFailed`
  12. Release lock
- Command metadata: `scope: "workspace"`, `cacheable: false`, `requiresNetwork: true`, `reads: ["werkstatt.gitmesh.json", "werkstatt.identity.json"]`, `writes: [".git/gitmesh.lock"]`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check` passes

**Completion criterion:** `sync.ts` exists, compiles, and `runGitMeshSync` implements the full convergence algorithm from RFC §Convergence algorithm.

**Human review:** no

---

### Step 4. Implement `gitmesh.status` command

**Goal:** Create the status handler as a local-only query.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/status.ts` with `runGitMeshStatus` handler:
  1. Load config (same as sync, but do not auto-create — fail with `no-config` if missing)
  2. `git rev-parse HEAD` → `localSha`
  3. For each remote: `git rev-parse refs/remotes/<remote>/<trackedBranch>` → find highest timestamp → `remoteSha`
  4. `git rev-list --count HEAD..<remoteSha>` → `behind`
  5. `git rev-list --count <remoteSha>..HEAD` → `ahead`
  6. Read last sync time from `.git/gitmesh.last-sync` file (written by sync command) → `lastSync`
  7. Return `GitMeshStatus`
- Command metadata: `scope: "workspace"`, `cacheable: false`, `reads: ["werkstatt.gitmesh.json", ".git/gitmesh.last-sync"]`
- No network I/O — purely local
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)
- Update `sync.ts` to write `.git/gitmesh.last-sync` timestamp file after successful sync

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check` passes

**Completion criterion:** `status.ts` exists, compiles, and `runGitMeshStatus` performs no network I/O.

**Human review:** no

---

### Step 5. Implement `gitmesh.verify` command

**Goal:** Create the signature verification handler with incremental verification.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/verify.ts` with `runGitMeshVerify` handler:
  1. Load config (fail with `no-config` if missing)
  2. Read operator public key from `werkstatt.identity.json` (fail with `no-identity` if missing)
  3. Read last verified SHA from `.git/gitmesh.last-verified` (if exists)
  4. `git log --format=%H,%G? <last-verified>..HEAD` (or full log if no last-verified) — `%G?` gives signature status: `G` (good), `B` (bad), `U` (unsigned), `X` (expired), `Y` (key missing)
  5. For each commit with `G`: verify Ed25519 signature in trailer against operator public key
  6. For each commit with `B`/`X`/`Y`: increment `invalidSignatures`
  7. For each commit with `U`: increment `unsignedCommits`
  8. Do NOT abort on first invalid — collect all results in one pass
  9. Write current HEAD SHA to `.git/gitmesh.last-verified`
  10. Return `GitMeshVerifyResult` with `totalCommits`, `signedCommits`, `unsignedCommits`, `invalidSignatures`, `verified`
- Command metadata: `scope: "workspace"`, `cacheable: false`, `reads: ["werkstatt.gitmesh.json", "werkstatt.identity.json", ".git/gitmesh.last-verified"]`, `writes: [".git/gitmesh.last-verified"]`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check` passes

**Completion criterion:** `verify.ts` exists, compiles, and `runGitMeshVerify` reports all invalid signatures in one pass without aborting.

**Human review:** no

---

### Step 6. Create gitmesh module and register in kernel config

**Goal:** Wire the three commands into the kernel registry.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/gitmesh-module.ts`:
  - `export const gitmeshModule: KernelModule` with `name: "gitmesh"`, `version: "0.1.0"`
  - `register()` dynamically imports handlers and registers `gitmesh.sync`, `gitmesh.status`, `gitmesh.verify`
  - Each command has `description` referencing RFC-0563
- Add `gitmeshModule` to `packages/os/site-kernel/src/index.ts` exports
- Add `gitmesh` module loader to `tools/kernel.config.ts`:
  ```ts
  gitmesh: async () => (await import("@warpgogol/site-kernel")).gitmeshModule,
  ```
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding to `gitmesh-module.ts` (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check` passes
- `pnpm exec site-kernel run gitmesh.sync --json` is recognized as a command (may fail on execution due to no config, but command lookup succeeds)

**Completion criterion:** `gitmesh.sync`, `gitmesh.status`, `gitmesh.verify` are registered commands discoverable via `site-kernel run`.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Cover the core logic of all three commands and the config loader.

**Agent actions:**

- Create `packages/os/site-kernel/src/gitmesh/gitmesh.test.ts` (or `*.spec.ts` per project convention):
  - Test `autoCreateConfigFromGit` — mock `.git/config` with remotes, verify config shape
  - Test `validateConfig` — reject missing fields, invalid types
  - Test convergence algorithm — mock multiple remote-tracking branches with different timestamps, verify highest-timestamp selection
  - Test non-fast-forward detection — mock `gitIsAncestor` returning false, verify `non-fast-forward` error
  - Test lock acquisition — mock lock file exists, verify `sync-in-progress` error
  - Test `gitmesh.status` — mock local SHA and remote-tracking refs, verify behind/ahead counts
  - Test `gitmesh.verify` — mock git log with mixed signature statuses, verify counts and `verified` flag
  - Test incremental verification — mock `.git/gitmesh.last-verified` exists, verify only new commits are checked
- Use vitest with mocking (no real git operations in unit tests)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel test` passes

**Completion criterion:** All test cases pass, covering config loading, convergence, status, verify, and error paths.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Synchronize AGENTS.md and Compass XML files.

**Agent actions:**

- Update `packages/os/site-kernel/AGENTS.md` — add a `## Git-mesh (RFC-0563)` section documenting:
  - `src/gitmesh/` directory purpose
  - Three commands: `gitmesh.sync`, `gitmesh.status`, `gitmesh.verify`
  - Config file: `werkstatt.gitmesh.json`
  - Lock file: `.git/gitmesh.lock`
  - Last-sync/last-verified state files
- Update `docs/technology.xml` — add git-mesh as Layer 1 of P2P topology (RFC-0562)
- Update `docs/development-plan.xml` — add git-mesh implementation milestone if the plan tracks P2P layers
- Verify each file in `scope.docs` is updated — check against `git diff`

**Validation:**

- `git diff --name-only` includes all three documentation files

**Completion criterion:** All documentation files in scope are updated with git-mesh references.

**Human review:** no

---

### Step 9. Run validation suite and fix issues

**Goal:** Ensure all mechanical checks pass before stamping.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0563 --json` — fix any violations
- Run `pnpm --filter @warpgogol/site-kernel build:check` — fix any type errors
- Run `pnpm --filter @warpgogol/site-kernel test` — fix any test failures
- Run `pnpm exec site-kernel run command.reads.validate` (if available) — ensure all three commands declare `reads` or `cacheable: false`
- Fix any issues found, re-run until all pass

**Validation:**

- All three commands pass with zero errors

**Completion criterion:** `rfc.validate`, `build:check`, and `test` all pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (gitmesh commands are new).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0563 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0563`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0563`
- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm --filter @warpgogol/site-kernel test`
- `pnpm exec site-kernel run ecosystem.manifest.generate` (if command surfaces changed)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0563` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session
- `rfc.implement.stamp` output confirming status transition

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Replication lag | Step 4: `gitmesh.status` makes lag visible via behind/ahead counts |
| Signature verification cost | Step 5: incremental verification via `.git/gitmesh.last-verified` |
| Signature verification false positives | Step 5: accepts list of valid public keys from `werkstatt.identity.json` |
| Trusted remote compromise | Step 1: config is operator-edited, compromised remotes can be removed |
| Git object safety | Step 2: only fetch from remotes in config; Step 3: `git fsck` before each sync |
| Merge conflicts | Step 3: pull-only design, `--ff-only` prevents merge commits |
| Agent misinterpretation | Step 3: `gitmesh.sync` is pull-only, no push operations implemented |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0563 --reason "..." --invariant "DNA-1"` instead of working around it.
- If `gitmesh.verify` cannot read Ed25519 signatures from commit trailers because RFC-0560's trailer format is not yet implemented, split the verify command into a follow-up RFC rather than implementing a partial verification.
- If the convergence algorithm (highest committer timestamp) proves ambiguous in practice (e.g., clock skew across workshops), escalate to a superseding RFC with a quorum-based or canonical-remote-priority algorithm.
