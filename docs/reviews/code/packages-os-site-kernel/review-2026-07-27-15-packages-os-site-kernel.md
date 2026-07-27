---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1dd480d...HEAD
filesReviewed:
  - packages/os/site-kernel/src/gitmesh/types.ts
  - packages/os/site-kernel/src/gitmesh/config.ts
  - packages/os/site-kernel/src/gitmesh/git-ops.ts
  - packages/os/site-kernel/src/gitmesh/sync.ts
  - packages/os/site-kernel/src/gitmesh/status.ts
  - packages/os/site-kernel/src/gitmesh/verify.ts
  - packages/os/site-kernel/src/gitmesh/gitmesh-module.ts
  - packages/os/site-kernel/src/index.ts
  - packages/os/site-kernel/src/tests/gitmesh.test.ts
  - packages/os/site-kernel/package.json
  - tools/kernel.config.ts
  - packages/os/site-kernel/AGENTS.md
  - docs/technology.xml
  - docs/development-plan.xml
---

# Code Review: 1dd480d...HEAD (RFC-0563 git-mesh implementation)

### Verdict: Needs revision

The implementation is structurally sound and covers all RFC-0563 acceptance criteria. However, three findings require fixes: duplicated git log call in sync.ts, missing `diagnostics` arrays on error returns (RFC-0086), and `publicKeys` loaded but unused in verify.ts.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel build:check` and `pnpm --filter @warpgogol/site-kernel test` both pass (151 tests, 19 files).

### Axis A — Structural correctness

1. **Duplicated git log call in sync.ts** — `gitLogSignatureStatus` is called twice with the same range `${currentHead}..${latest.sha}` when `verifySignatures` is true: once at line 185 for signature verification and again at line 215 to count commits. The second call re-runs the same git command. Reuse the result from the first call.

### Axis B — DNA alignment

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` (DNA-42). The lock mechanism uses atomic `open(..., "wx")` which is appropriate for concurrent execution prevention.

### Axis C — Ecosystem fit

1. **Missing `diagnostics` arrays on error returns (RFC-0086)** — The site-kernel AGENTS.md states: "When a kernel command returns `{ exitCode > 0, data }`, populate one of the recognized arrays so the text-mode printer can emit each item: `data.diagnostics: string[]`, `data.violations: object[]`, `data.findings: object[]`, or `data.details: object[]`." All error returns in `sync.ts`, `status.ts`, and `verify.ts` return `exitCode: 1` with `data` but no `diagnostics` array. Agents reading text output cannot see what failed without re-running with `--json`.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths.

### Axis E — Agent-facing clarity

1. **`publicKeys` loaded but unused in verify.ts** — `loadIdentityPublicKeys` is called at line 82 and the result is checked for emptiness (line 97), but the actual public keys are never used in the verification logic. The code relies entirely on git's `%G?` signature status, which checks git's keyring — not the operator's specific public key. The RFC acceptance criterion says "verifies all commit signatures against operator public key." The code loads the keys but doesn't compare them against the signing keys. This is either a deferred dependency on RFC-0560's trailer format (in which case it should be documented with a TODO referencing RFC-0560) or an incomplete implementation.

### Axis F — Pragmatism

No issues. Three commands, each with a clear distinct purpose. Types are minimal. Module registration follows the existing pattern.

### Axis G — Blind spots

1. **Stale lock detection** — If the process is killed between lock acquisition and release, the lock file at `.git/gitmesh.lock` remains and all future syncs fail with `sync-in-progress`. Consider adding a stale lock check (e.g., PID file or timestamp-based expiry).
2. **Full verification cost on first run** — `gitmesh.verify` with `--all` range on a large repository could be expensive. The RFC acknowledges this but the code doesn't emit a warning or estimated cost on the first full run.

### Spec compliance

| Requirement from RFC-0563 | Status | Evidence |
| --- | --- | --- |
| Types defined | Done | types.ts:14-57 |
| gitmesh.sync fetches and converges | Done | sync.ts:128-159 |
| gitmesh.status reports SHA/behind/ahead/lastSync | Done | status.ts:52-77 |
| gitmesh.verify against operator public key | Partial | verify.ts loads keys but doesn't compare them against signing keys |
| Config schema defined and validated | Done | config.ts:28-66 |
| Pull-only — never pushes | Done | git-ops.ts has no push function |
| Verify reports unsigned/invalid/total | Done | verify.ts:143-153 |
| rfc.validate passes | Done | exitCode 0, 0 violations |

### Questions for the author

1. Should `gitmesh.verify` actually compare signing keys against the operator's public key from `werkstatt.identity.json`, or is this deferred to RFC-0560's trailer format implementation?
2. Is the stale lock scenario (process killed mid-sync) handled elsewhere, or should `gitmesh.sync` detect stale locks?
3. Should the duplicated `gitLogSignatureStatus` call in sync.ts be consolidated into a single call?
