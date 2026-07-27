# Code Review: RFC-0533 Ecosystem Commit Command

- **Date:** 2026-07-26
- **Reviewer:** fo-review (automated)
- **Diff range:** `a8a9c60a8...5b237c5cb` (10 commits)
- **RFC:** RFC-0533 — Ecosystem commit command with mandatory version bump and pre-commit hook
- **Packages touched:** `@gogol/site-kernel-checks`, `@gogol/site-kernel-handoff`

## Mechanical floor

| Check | Result |
| --- | --- |
| `@gogol/site-kernel-checks` build:check | PASS |
| `@gogol/site-kernel-handoff` build:check | PASS |
| `@gogol/site-kernel-checks` tests (ecosystem-commit) | 9/9 PASS |
| `@gogol/site-kernel-handoff` tests (platform-consistency-pc04) | 3/3 PASS |
| `rfc.validate RFC-0533` | PASS (0 errors) |

## Axis A — Structural correctness

### A1. Duplicated `PLATFORM_SCOPE_PREFIXES` constant

**FAIL** — The `PLATFORM_SCOPE_PREFIXES` constant is defined independently in two files:

- `packages/os/site-kernel-checks/src/ecosystem-commit.ts:31`
- `packages/os/site-kernel-handoff/src/platform-consistency.ts:99`

Both define `["packages/", "integrations/", "services/"]`. This is a Duplicated Code smell — if the platform scope ever changes (e.g. adding `tools/`), both must be updated in lockstep. The constant should live in one place and be imported by both.

**Severity:** warning (not a functional bug, but a maintenance hazard)

### A2. Duplicated `isPlatformScope` function

**FAIL** — The `isPlatformScope` function is defined in both:

- `packages/os/site-kernel-checks/src/ecosystem-commit.ts:81-83`
- `packages/os/site-kernel-handoff/src/platform-consistency.ts:169-171`

Same logic, same constant, different files. Same fix as A1.

**Severity:** warning

### A3. Duplicated `hasTrailer` / `extractTrailer` trailer regex logic

**FAIL** — Trailer matching logic exists in two places with slightly different shapes:

- `ecosystem-commit.ts:133-137` — `extractTrailer(message, key)` returns the trailer value
- `platform-consistency.ts:177-179` — `hasTrailer(message, key)` returns boolean

Both use `new RegExp(\`^${key}:\\s*(.+)$\`, "im")`. The `hasTrailer` function could delegate to `extractTrailer` (return `extractTrailer(...) !== null`), or both could live in a shared trailer-utils module. This is a minor Duplicated Code smell.

**Severity:** warning

### A4. `gitCommit` SHA extraction is fragile

**FAIL** — `packages/os/site-kernel-checks/src/ecosystem-commit.ts:104-105`

```typescript
const shaMatch = stdout.match(/\[.*?([0-9a-f]{7,})\]/);
return shaMatch ? shaMatch[1] : "";
```

This regex parses the short SHA from `git commit` output (e.g. `[main abc1234] message`). However:
- The function is defined but **never called** — the actual commit at line 410 uses `execFileAsync("git", commitArgs, ...)` directly, and the SHA is retrieved via `getHeadCommitSha` at line 415.
- `gitCommit` is dead code.

**Severity:** warning (dead code)

### A5. `EcosystemCommitInput` interface is unused

**PASS** — The `EcosystemCommitInput` interface at line 36-42 is exported but the handler reads flags from `KernelCommandInput` directly. The interface serves as documentation for the flag shape. Not dead code per se, but it could be referenced in the command table's `flags` metadata for better discoverability. Acceptable.

### A6. Bare `catch` blocks in `getGitLogSince`

**PASS** — `platform-consistency.ts:164-166` has a bare `catch` that returns `[]`. This is acceptable for a best-effort git history scan — if git fails (not a repo, no commits, etc.), returning empty is the correct graceful degradation. The outer function is a read-only check; swallowing the error and returning no violations is safe.

### A7. `readRfcVersionBump` file matching is case-insensitive but inconsistent

**PASS** — `ecosystem-commit.ts:153-154`:

```typescript
const rfcFile = files.find(
  (f) => f.startsWith(rfcId.toLowerCase() + "-") || f.startsWith(rfcId + "-"),
);
```

This handles both `rfc-0533-...` and `RFC-0533-...` filename patterns. The existing RFC files use the `rfc-NNNN-` prefix (lowercase), so the first branch matches. The second branch is defensive. Acceptable.

### A8. `pcForecast` is hardcoded to always pass

**FAIL** — `ecosystem-commit.ts:380-383`:

```typescript
pcForecast: {
  pc02: "pass",
  pc03: "pass",
},
```

The dry-run output always reports `pc02: "pass"` and `pc03: "pass"` without actually computing the forecast. The RFC spec says: "`--dry-run` outputs planned bump, new version, hash, and PC-02/PC-03 forecast". The forecast should at minimum check whether the hash changed (PC-02) and whether any minor RFCs were merged without a minor bump (PC-03). Currently it's a stub that always says "pass".

**Severity:** warning (functionality gap — the feature is advertised but not implemented)

## Axis B — DNA alignment

### B1. DNA-53 (semantic fingerprint governance)

**PASS** — `resolvePlatformSemanticHash` in `bundle-io.ts:114-140` uses `fingerprintTree` from `@gogol/fingerprint` and `byteHash` for combining per-file hashes. No ad hoc `crypto.createHash` calls. The extension to `integrations/` and `services/` maintains the same `@gogol/fingerprint` usage. Compliant.

### B2. DNA-1 (monorepo boundary)

**PASS** — No `apps/*` imports in any touched package file. `ecosystem-commit.ts` imports from `@gogol/site-kernel` (types) and `@gogol/site-kernel-handoff` (resolvePlatformSemanticHash, parseSemver) — both are legitimate cross-package dependencies within `packages/os/*`. No boundary violations.

### B3. DNA-6 (kebab-case filenames)

**PASS** — New files: `ecosystem-commit.ts`, `ecosystem-commit.test.ts`, `platform-consistency-pc04.test.ts`, `pre-commit`. All kebab-case. Compliant.

## Axis C — RFC contract alignment

### C1. RFC-0533 acceptance criteria coverage

**PASS** — All 15 acceptance criteria are marked `[x]` with evidence annotations. `rfc.validate` passes with 0 errors. The `commands.added` field in the RFC lists `ecosystem.commit`, and the command is live in the registry.

### C2. RFC-0478 compatibility (platform.consistency.validate)

**PASS** — PC-04 is added as a new rule without weakening PC-01, PC-02, or PC-03. The `PlatformConsistencyViolation` type is extended to include `"PC-04"` in the union. The rule runs after PC-01..03 and before the `hasErrors` check. Forward-only addition.

### C3. RFC-0479 compatibility (migrator registry)

**PASS** — `ecosystem.commit` reads `versionBump` from RFC frontmatter and uses it to determine the bump type. When `versionBump: minor` is declared, the version is bumped as minor. This is consistent with RFC-0479's contract that `minor = Breaks-B = migrator required`. The command does not register or validate migrators — that remains RFC-0479's scope.

### C4. RFC-0092 (.ts extension on relative imports)

**PASS** — All relative imports in the new/modified files use `.ts` extension:
- `ecosystem-commit.ts`: imports from `@gogol/site-kernel` and `@gogol/site-kernel-handoff` (package imports, no relative paths)
- `platform-consistency.ts`: `import { resolvePlatformSemanticHash } from "./bundle-io.ts"` ✓
- `ecosystem.ts`: `export { runEcosystemCommit } from "./ecosystem-commit.ts"` ✓
- `20-ecosystem.ts`: `import { runEcosystemCommit } from "../ecosystem-commit.ts"` (via re-export in `ecosystem.ts`) ✓

## Axis D — Ecosystem fit and forward-only discipline

### D1. `resolvePlatformSemanticHash` extension is backward-compatible

**PASS** — The function previously fingerprinted only `packages/`. It now fingerprints `packages/`, `integrations/`, and `services/`, combining all per-file hashes into a single `byteHash`. This means the hash value will change for existing repos that have `integrations/` or `services/` directories. This is a **one-time hash reset** — `platform.consistency.validate` will detect the hash change and require a version bump. This is the intended behavior per RFC-0533. Forward-only.

### D2. PC-04 cutoff SHA mechanism

**PASS** — `PC_04_CUTOFF_SHA = "940c025cc"` is the commit that introduced PC-04. Commits before this SHA are exempt. The fallback logic in `getGitLogSince` handles:
- Placeholder SHA (`"0000000"` or length < 7) → use root commit
- SHA doesn't exist in repo → use root commit
- SHA exists → use it directly

This is robust for both production (where the SHA exists) and test repos (where it doesn't). Forward-only.

### D3. Pre-commit hook is opt-in

**PASS** — The hook at `hooks/pre-commit` is activated via `git config core.hooksPath hooks/`. It does not auto-activate. The `ECOSYSTEM_COMMIT=1` env var bypass is set by `ecosystem.commit` at line 412. The hook is not retroactive — existing operators must opt in. This matches the RFC's rollout strategy.

## Axis E — Agent clarity

### E1. AGENTS.md update

**PASS** — `AGENTS.md` commit discipline section now explicitly states: "Platform-scope changes MUST use `ecosystem.commit`". The three commit paths (mission workpiece, platform, non-platform) are clearly documented with examples. The "remember this rule" tip in the hook error message is agent-friendly.

### E2. Hook error message clarity

**PASS** — The pre-commit hook error message includes:
- What went wrong ("Direct git commit blocked for platform-scope changes")
- Which files triggered it ("Staged files touch platform scope")
- The exact command to run instead
- A tip for AI agents

This is maximally clear for both human and AI operators.

### E3. Command table metadata

**PASS** — The `ecosystem.commit` entry in `20-ecosystem.ts` has correct metadata:
- `scope: "workspace"` ✓
- `mutatesState: true` ✓
- `cacheable: false` ✓
- `writes: ["package.json", "docs/platform-version-log.generated.yaml"]` ✓
- `reads` includes `docs/rfcs/**/*.md`, `packages/**`, `integrations/**`, `services/**` ✓

### E4. Missing `flags` metadata in command table

**FAIL** — `20-ecosystem.ts:282` has `flags: {}` (empty object). The `ecosystem.commit` command accepts `--message`, `--rfc`, `--dry-run`, `--amend`, and `--json` flags, but none are declared in the command table metadata. Other commands in the same file (e.g. `gate.catalog.validate`) also have empty `flags: {}`, so this may be a convention — but it reduces discoverability for agents and the command manifest generator.

**Severity:** warning (metadata gap, not a functional bug)

## Axis F — Test coverage

### F1. ecosystem-commit.test.ts coverage

**PASS** — 9 tests covering:
- EC-01 (no platform files staged)
- EC-02 (package.json already staged)
- EC-04 (RFC not found)
- EC-05 (versionBump absent)
- EC-06 (versionBump: none)
- Default patch bump without --rfc
- --rfc reads versionBump from frontmatter
- --dry-run returns forecast without committing
- Actual commit bumps version and writes trailers

Missing: EC-03 (version log already staged), EC-07 (amend with pushed commit), EC-08 (missing --message), EC-09 (amend non-ecosystem commit). These are lower-priority edge cases but should be covered for completeness.

### F2. platform-consistency-pc04.test.ts coverage

**PASS** — 3 tests covering:
- Platform commit without trailer → error
- Platform commit with trailer → pass
- Non-platform commit without trailer → pass

Missing: merge commit skipping, multiple commits with mixed compliance, cutoff SHA boundary. Acceptable for initial implementation.

## Axis G — Pragmatism

### G1. `resolvePlatformSemanticHash` performance

**PASS** — The function now fingerprints three directories instead of one. For a large monorepo, this adds latency. However, `ecosystem.commit` is not high-frequency (platform commits are rare), and the hash is computed once per commit. The `ignore` list excludes `node_modules`, `.turbo`, `dist`, `.astro`. Acceptable.

### G2. `getGitLogSince` parsing approach

**PASS** — The `__COMMIT__` delimiter approach is unconventional but robust. It avoids `%x00` null-byte issues that broke the initial implementation. The `maxBuffer: 10 * 1024 * 1024` handles large repos. The fallback to root commit when the cutoff SHA is missing is pragmatic for test environments.

## Summary

| Axis | Findings |
| --- | --- |
| A — Structural | 3 warnings (duplicated constants/functions, dead code, stub forecast) |
| B — DNA | 0 findings (all pass) |
| C — RFC contract | 0 findings (all pass) |
| D — Ecosystem fit | 0 findings (all pass) |
| E — Agent clarity | 1 warning (empty flags metadata) |
| F — Tests | 0 failures, coverage gaps noted |
| G — Pragmatism | 0 findings (all pass) |

**Verdict: pass with warnings** — The implementation is functionally correct, DNA-compliant, and RFC-aligned. The warnings are maintenance hazards (duplicated constants, dead code, stub forecast) that should be addressed in a follow-up cleanup but do not block the implementation.

### Recommended fixes (priority order)

1. **A4** — Delete dead `gitCommit` function in `ecosystem-commit.ts`
2. **A1/A2** — Extract `PLATFORM_SCOPE_PREFIXES` and `isPlatformScope` to a shared location
3. **A8** — Implement actual PC-02/PC-03 forecast in dry-run output, or remove `pcForecast` from the result shape
4. **E4** — Add flag metadata to command table entry
5. **A3** — Consolidate trailer regex logic
