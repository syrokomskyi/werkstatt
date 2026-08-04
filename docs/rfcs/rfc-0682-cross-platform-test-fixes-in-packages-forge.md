---
id: RFC-0682
title: "Cross-platform test fixes in packages/forge"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-04
updatedAt: 2026-08-04
enhancedAt: 2026-08-04
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0681
  - RFC-0374
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "`pnpm test` in packages/forge passes on Windows"
  - "No `execSync` call in forge tests uses shell chaining (`&&`) or inline env vars"
  - "No forge test hardcodes `/tmp/` as a path prefix"
nonGoals:
  - "Changing forge runtime source code (`src/`, `os/` handlers)"
  - "Adding Windows CI matrix for forge"
  - "Modifying tests outside `packages/forge`"
# acceptance:
#   - probe: run
#     command: "pnpm --filter @warpgogol/forge test"
#     expect:
#       exitCode: 0
---

# RFC-0682: Cross-platform test fixes in packages/forge

## Context

The root `AGENTS.md` states: "`@warpgogol/forge` (published to npm) must remain cross-platform — it ships skills and command modules that consumers may run on Windows or Linux. Forge source and skills must not assume a POSIX-only environment."

While the forge runtime source (`src/`, `os/`) is already cross-platform (uses `node:path`, `execFileSync("git", [...args])`, backslash normalization), the **test suite** in `packages/forge` contains three categories of POSIX-only patterns that prevent tests from passing on Windows:

1. **Shell chaining (`&&`)** in `execSync` calls — `cmd.exe` does not support `&&`.
2. **Inline env vars** (`GIT_AUTHOR_DATE="..." git commit ...`) — POSIX shell syntax, not supported by `cmd.exe`.
3. **Hardcoded `/tmp/` paths** — `/tmp/` does not exist on Windows. `path.join` on Windows produces backslash-separated paths, causing assertion mismatches.

## Problem

Running `pnpm test` in `packages/forge` on Windows fails because:

### Shell chaining (`&&`)

`execSync("git add . && git commit -m 'initial'")` fails on Windows `cmd.exe` — `&&` is not a valid command separator. Node.js `execSync` uses `cmd.exe` as the default shell on Windows.

**Affected files:**

- `src/tests/migration-adapters.test.ts` — lines 283, 343

### Inline env vars

`execSync('GIT_AUTHOR_DATE="..." GIT_COMMITTER_DATE="..." git commit ...')` fails on Windows — inline env var assignment before a command is POSIX shell syntax, not `cmd.exe` syntax.

**Affected files:**

- `os/adr/handlers/validate.test.ts` — lines 58-61
- `os/rfc/handlers/validate-rules.test.ts` — lines 315-318

### Hardcoded `/tmp/` paths

Tests use `"/tmp/test/..."` as mock path values. On Windows, `path.join` and `path.dirname` produce backslash-separated paths, causing assertions like `expect(result).toBe("/tmp/test/file.archive.md")` to fail.

**Affected files:**

- `os/rfc/handlers/validate-rules.test.ts` — lines 117, 237, 257, 280, 300, 395
- `os/rfc/handlers/lifecycle.test.ts` — lines 45, 65, 85, 105, 125, 145
- `src/tests/promote.test.ts` — line 52
- `src/tests/compact.test.ts` — lines 44, 300-302, 306-308
- `src/tests/budgets.test.ts` — lines 13, 122, 135, 145, 152, 161, 168, 176, 186, 196

## Decision

All three categories of POSIX-only patterns are replaced with cross-platform equivalents:

1. **Shell chaining** → split into separate `execSync` calls (or `execFileSync` with arg arrays).
2. **Inline env vars** → use `execFileSync("git", [...args], { env: { ...process.env, GIT_AUTHOR_DATE: ... } })`.
3. **Hardcoded `/tmp/`** → use `os.tmpdir()` with `path.join()` for both mock values and expected assertions.

## Architectural fit

- **Root AGENTS.md cross-platform rule:** Brings forge tests into compliance.
- **RFC-0681:** Complementary — RFC-0681 fixes the skill, this RFC fixes the tests.
- **No DNA impact:** Test infrastructure changes do not affect architectural invariants.

## Design

### Pattern 1: Shell chaining → separate calls

Before:

```ts
execSync("git add . && git commit -m 'initial'", { cwd: sourceDir, stdio: "pipe" });
```

After:

```ts
execSync("git add .", { cwd: sourceDir, stdio: "pipe" });
execSync("git commit -m initial", { cwd: sourceDir, stdio: "pipe" });
```

### Pattern 2: Inline env vars → execFileSync with env option

Before:

```ts
execSync(
  `GIT_AUTHOR_DATE="${c.date}" GIT_COMMITTER_DATE="${c.date}" git commit --allow-empty -m "${c.message}"`,
  { cwd: dir, timeout: 5000 },
);
```

After:

```ts
execFileSync(
  "git",
  ["commit", "--allow-empty", "-m", c.message],
  {
    cwd: dir,
    timeout: 5000,
    env: { ...process.env, GIT_AUTHOR_DATE: c.date, GIT_COMMITTER_DATE: c.date },
    stdio: "pipe",
  },
);
```

### Pattern 3: Hardcoded `/tmp/` → os.tmpdir() + path.join

Before:

```ts
path: "/tmp/test/learned-principles.md",
// ...
expect(plans[0].archiveFile).toBe("/tmp/test/qa-log.archive.md");
```

After:

```ts
import { tmpdir } from "node:os";
const testDir = join(tmpdir(), "test");
// ...
path: join(testDir, "learned-principles.md"),
// ...
expect(plans[0].archiveFile).toBe(join(testDir, "qa-log.archive.md"));
```

For workspace root placeholders in validation tests (where the path is used as a string label, not for file I/O):

Before:

```ts
const violations = await runValidateInDir(parsed, "/tmp/test-workspace");
```

After:

```ts
const violations = await runValidateInDir(parsed, join(tmpdir(), "test-workspace"));
```

## Rollout

- **Test-only changes:** No runtime source code is modified. No CLI commands change. No skill files change.
- **No migration:** Existing CI on Linux continues to pass — `os.tmpdir()` returns `/tmp` on Linux, so `join(tmpdir(), "test")` produces `/tmp/test` on Linux (identical behavior).
- **No new dependencies:** All replacements use `node:os`, `node:path`, and `node:child_process` — already imported.

## Alternatives considered

- **Add `shell: true` with explicit shell path on Windows:** Rejected — adds complexity and still requires POSIX-compatible shell (Git Bash). Splitting commands is simpler and more portable.
- **Use `cross-env` package for env vars:** Rejected — `execFileSync` with `env` option is built-in and sufficient. No new dependency needed.
- **Skip Windows test support:** Rejected — the root AGENTS.md mandates cross-platform forge. Tests that can't run on Windows are a compliance gap.

## Risks

- **`os.tmpdir()` path length on Windows:** Windows `TEMP` can be long (`C:\Users\<user>\AppData\Local\Temp`). Git on Windows has path length issues. Mitigation: test directories are shallow (`join(tmpdir(), "test")`) — well within limits.
- **`execFileSync` vs `execSync` behavior difference:** `execFileSync` does not use a shell by default, which is the desired behavior for cross-platform. The git commands being called are simple and don't need shell features.
- **Assertion path separator mismatch:** Using `path.join()` for both mock values and expected assertions ensures they use the same separator on every platform.

## Acceptance criteria

- [x] No `execSync` call in `packages/forge` tests uses `&&` shell chaining (evidence: grep search — no results)
- [x] No `execSync` call in `packages/forge` tests uses inline env var assignment (`VAR="value" command`) (evidence: grep search — no results)
- [x] No test file in `packages/forge` hardcodes `/tmp/` as a path prefix (evidence: grep search — no results)
- [x] `os/adr/handlers/validate.test.ts` uses `execFileSync` with `env` option for `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` (evidence: validate.test.ts:58-63)
- [x] `os/rfc/handlers/validate-rules.test.ts` uses `execFileSync` with `env` option for `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` (evidence: validate-rules.test.ts:317-322)
- [x] `src/tests/migration-adapters.test.ts` splits `git add . && git commit` into separate calls (evidence: grep — no `&&` found)
- [x] `src/tests/compact.test.ts` uses `os.tmpdir()` and `path.join()` for mock paths and assertions (evidence: grep — no `/tmp/` found)
- [x] `src/tests/budgets.test.ts` uses `os.tmpdir()` and `path.join()` for mock paths and assertions (evidence: grep — no `/tmp/` found)
- [x] `src/tests/promote.test.ts` uses `os.tmpdir()` and `path.join()` for mock paths (evidence: grep — no `/tmp/` found)
- [x] `os/rfc/handlers/lifecycle.test.ts` uses `os.tmpdir()` for workspace root placeholders (evidence: lifecycle.test.ts:8)
- [x] `pnpm --filter @warpgogol/forge test` passes on Linux (regression check) (evidence: 610 tests passed)
- [x] `rfc.validate` passes on this RFC (evidence: rfc.validate — 0 errors, 0 warnings)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
-->
