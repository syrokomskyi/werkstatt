---
rfcId: RFC-0605
planId: PLAN-RFC-0605-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/passport"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/passport/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0605

## 1. Objectives

- [ ] O1 — Export `generateKeypair` from `@warpgogol/passport` (maps to AC: `generateKeypair` exported)
- [ ] O2 — Implement `passport.key.ensure` command handler (maps to AC: command registered, creates key, no-op if exists, never prints private key)
- [ ] O3 — Register `passport.key.ensure` in command table with correct flags and metadata (maps to AC: command registered with `scope: "app"`, `mutatesState: true`, `cacheable: false`)
- [ ] O4 — Update `GENERATOR_OWNERSHIP_MAP` to transfer ownership from `passport.key.rotate` to `passport.key.ensure` (maps to AC: ownership map lists `passport.key.ensure`, `generator.ownership.lint` passes)
- [ ] O5 — Write unit tests for the ensure command (maps to AC: all behavioral criteria)
- [ ] O6 — Update documentation surfaces (maps to AC: `packages/passport/AGENTS.md` updated, `docs/COMMANDS.md` updated)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/passport/src/index.ts` — add `generateKeypair` to barrel export (currently defined in `sign.ts:88` but not exported)
- `packages/os/site-kernel-checks/src/passport.ts` — add `runPassportKeyEnsure` handler function
- `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts` — register `passport.key.ensure` command entry, add import for `runPassportKeyEnsure`
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — change `cosmic-passport-key.json` owner from `passport.key.rotate` to `passport.key.ensure`

### 2.2 Configuration and data

- No YAML/JSON/manifest changes. The command reads `system.md` for `appId` and writes `public/.well-known/cosmic-passport-key.json`.

### 2.3 Documentation and specs

- `packages/passport/AGENTS.md` — add `generateKeypair` to the exports table
- `docs/COMMANDS.md` — add `passport.key.ensure` to the command inventory (if maintained)
- RFC file is read-only reference — no edits during implementation

### 2.4 Validation and pipelines

- `generator.ownership.lint` — must pass with no multi-owner violations after ownership transfer
- `command.manifest.validate` — must pass with no CMD-MAN-03 warnings for the new command
- `kernel.flags.lint` — must pass with no KERNEL-FLAG-04 violations (flag reads match declared flags)
- No pipeline changes in this RFC — `build.prepare` integration is RFC-0604

## 3. Step sequence

### Step 1. Export `generateKeypair` from `@warpgogol/passport`

**Goal:** Make `generateKeypair` available as a public export from the passport package.

**Agent actions:**

- Add `generateKeypair` to the export list in `packages/passport/src/index.ts` (currently exported from `./sign.ts` alongside `signBytes` and `verifyBytes`)
- Add the return type export: `export type { EnsureKeyOptions, EnsureKeyResult }` — wait, these types don't exist yet. Only export `generateKeypair` and its return type here. The `EnsureKeyOptions`/`EnsureKeyResult` interfaces will live in `site-kernel-checks/src/passport.ts`.

**Validation:**

- `pnpm --filter @warpgogol/passport build:check` — typecheck passes

**Completion criterion:** `generateKeypair` is importable from `@warpgogol/passport` and the package typechecks.

**Human review:** no

---

### Step 2. Implement `runPassportKeyEnsure` handler

**Goal:** Create the command handler function that idempotently ensures the passport key file exists.

**Agent actions:**

- Add `runPassportKeyEnsure` function to `packages/os/site-kernel-checks/src/passport.ts`
- The handler must:
  1. Resolve Astro site paths via `requireAstroSitePaths(context)` — fail with PKE-00 if paths cannot be resolved
  2. Load system manifest via `loadSystemManifest(paths.contentDirectory)` — fail with PKE-01 if manifest is missing
  3. Check if `public/.well-known/cosmic-passport-key.json` exists (use `readFile` with try/catch)
  4. If file exists: parse with `PassportPublicKeyFileSchema`, find the active key (`active: true`), fail with PKE-03 if no active key exists, return `{ created: false, version: <active-key-version>, publicKeyFilePath }`
  5. If file does not exist: call `generateKeypair()` from `@warpgogol/passport`, construct the key file object with `schemaVersion: "1.0"`, `appId`, `keys: [{ version: "v1", active: true, type: "Ed25519VerificationKey2020", publicKeyMultibase, createdAt: <ISO-8601> }]`, write to `public/.well-known/cosmic-passport-key.json` via `writeFile` after `mkdir(dirname, { recursive: true })`
  6. If `--private-key-out` flag is provided and a new key was created: write `privateKeyHex` to the specified path with `0600` permissions (use `writeFile` then `chmod` from `node:fs/promises`), fail with PKE-04 if write fails
  7. Never print the private key to stdout
  8. Return `pass()` with `data: { created, version, publicKeyFilePath, privateKeyWrittenTo? }`
- Import `generateKeypair` from `@warpgogol/passport` (or `@warpgogol/passport/sign` if using subpath export)
- Import `PassportPublicKeyFileSchema` from `@warpgogol/passport` (already available)
- Define `EnsureKeyOptions` and `EnsureKeyResult` interfaces as described in the RFC design section

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` — typecheck passes

**Completion criterion:** `runPassportKeyEnsure` function exists, typechecks, and implements all failure modes (PKE-01 through PKE-04) and the no-op behavior.

**Human review:** no

---

### Step 3. Register `passport.key.ensure` in command table

**Goal:** Register the new command in the growth-passport command table.

**Agent actions:**

- Add `runPassportKeyEnsure` to the import list in `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts`
- Add a new `CheckCommandEntry` after the `passport.key.rotate` entry:
  ```ts
  {
    name: "passport.key.ensure",
    description:
      "Ensure public/.well-known/cosmic-passport-key.json exists. Creates a new Ed25519 keypair if missing (no-op if exists). Never prints private key to stdout (RFC-0605).",
    scope: "app",
    flags: {
      "private-key-out": {
        kind: "string",
        description: "File path to write the private key to (only when a new key is created). File is created with 0600 permissions.",
      },
    },
    supportsAllSites: false,
    mutatesState: true,
    writes: ["<app>/public/.well-known/cosmic-passport-key.json"],
    cacheable: false,
    execute: runPassportKeyEnsure,
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` — typecheck passes
- `pnpm exec site-kernel run command.manifest.validate --json` — no CMD-MAN-03 warnings for `passport.key.ensure`

**Completion criterion:** Command is registered with correct scope, flags, writes, and metadata.

**Human review:** no

---

### Step 4. Transfer `GENERATOR_OWNERSHIP_MAP` ownership

**Goal:** Update the ownership map so `passport.key.ensure` is the registered owner of `cosmic-passport-key.json`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generator-ownership.ts`, find the entry at line ~370:
  ```ts
  {
    path: "public/.well-known/cosmic-passport-key.json",
    command: "passport.key.rotate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/passport.ts",
  },
  ```
- Change `command: "passport.key.rotate"` to `command: "passport.key.ensure"`
- Keep the same `markerPolicy` and `module` (the module file is the same — `passport.ts` hosts both handlers)

**Validation:**

- `pnpm exec site-kernel run generator.ownership.lint --json` — no multi-owner violations
- `pnpm exec site-kernel run command.manifest.validate --json` — no CMD-MAN-03 warnings (the `passport.key.ensure` command is registered and its `writes[]` includes the expected path)

**Completion criterion:** `generator.ownership.lint` passes with zero violations; `command.manifest.validate` has no warnings for the passport key entry.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Test all behavioral paths of `runPassportKeyEnsure`.

**Agent actions:**

- Create test file at `packages/os/site-kernel-checks/src/tests/passport-key-ensure.test.ts` (vitest config requires tests under `src/tests/`)
- Test cases:
  1. **No-op when key file exists** — set up a temp app directory with a valid `cosmic-passport-key.json` containing one active key; run the handler; assert `created: false`, `version` matches the active key's version, file is untouched
  2. **Creates key when file missing** — set up a temp app directory with no key file; run the handler; assert `created: true`, `version: "v1"`, file exists and is schema-valid, no private key in stdout
  3. **Never prints private key to stdout** — spy on `console.log`; run handler for both create and no-op paths; assert `console.log` is never called with the private key
  4. **`--private-key-out` writes private key with 0600 permissions** — run handler with `flags["private-key-out"]` pointing to a temp file; assert file exists, contains the private key hex, and has `0o600` permissions (use `stat` from `node:fs/promises`)
  5. **PKE-01: manifest missing** — set up a temp directory with no `system.md`; run handler; assert fail with PKE-01
  6. **PKE-03: all keys inactive** — set up a temp app directory with a valid key file where all keys have `active: false`; run handler; assert fail with PKE-03
  7. **PKE-03: corrupt key file** — set up a temp app directory with an invalid JSON key file; run handler; assert fail with PKE-03
  8. **PKE-04: private key output path unwritable** — run handler with `--private-key-out` pointing to a non-existent directory; assert fail with PKE-04
- Mock `requireAstroSitePaths` and `loadSystemManifest` as needed, or use real temp directories with minimal `system.md` fixtures

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks test` — all tests pass

**Completion criterion:** All 8 test cases pass; test file is under `src/tests/` (per vitest config).

**Human review:** no

---

### Step 6. Update documentation

**Goal:** Sync AGENTS.md and command inventory with the new export and command.

**Agent actions:**

- Update `packages/passport/AGENTS.md` — add `generateKeypair` to the exports table row for `@warpgogol/passport/sign` or add a new row if needed
- Update `docs/COMMANDS.md` — add `passport.key.ensure` to the command inventory (if the file maintains a command list; check first)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (new command registered)

**Validation:**

- `git diff` shows only the expected documentation files changed
- `pnpm --filter @warpgogol/passport build:check` still passes

**Completion criterion:** `packages/passport/AGENTS.md` lists `generateKeypair`; `docs/COMMANDS.md` lists `passport.key.ensure` (if maintained).

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files with new modules, commands, or ownership changes (done in Step 6).
- Update affected `docs/*.xml` Compass files if repository-wide semantics changed (no Compass XML changes expected — this is a package-internal command addition).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (done in Step 6).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0605 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0605`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0605`
- `pnpm --filter @warpgogol/passport build:check`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm exec site-kernel run generator.ownership.lint --json`
- `pnpm exec site-kernel run command.manifest.validate --json`
- `pnpm exec site-kernel run kernel.flags.lint --json` (if available — verifies flag declarations match handler reads)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0605` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Two commands writing to the same file | Step 4 transfers ownership to `passport.key.ensure` in `GENERATOR_OWNERSHIP_MAP`; `passport.key.rotate` remains registered but not in the ownership map — `generator.ownership.lint` enforces single ownership |
| Private key not stored in pipeline | Step 2 implements `--private-key-out` with `0600` permissions; Step 5 test case 4 verifies the file is written with correct permissions; Risks section documents the recommended workflow (operator runs `passport.key.rotate` once for initial key + secret storage) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-34, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0605 --reason "..." --invariant "DNA-34"` instead of working around it.
- If `generateKeypair` cannot be exported from `@warpgogol/passport` (e.g. due to a workspace cycle), escalate to the operator — do not duplicate the keypair generation logic in `site-kernel-checks`.
