---
reviewId: REVIEW-CODE-2026-07-13-02
date: 2026-07-13
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: ae24104b9..baaed053b
filesReviewed:
  - packages/fingerprint/src/normalizers/html.ts
  - packages/fingerprint/src/normalizers/html.test.ts
  - packages/fingerprint/src/normalizers/index.ts
  - packages/fingerprint/src/index.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapter.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.test.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: ae24104b9..baaed053b (wg-fix for RFC-0379)

### Verdict: Approved

The fix diff addresses six findings from the prior review (G-1, E-1, E-2, A-1, A-2, G-3) with minimal, targeted changes. The mechanical floor passes, all axes are clean, and no new issues are introduced. One minor pre-existing test gap noted on axis G.

### Mechanical floor

Pass — `build:check` and `test` pass for `@gogol/fingerprint` and `@gogol/site-kernel-handoff` (49 tests, 11 files).

### Axis A — Structural correctness

No issues. `CommandRunner` type already declared `env?: Record<string, string>` in opts — the fix correctly uses it. `createDefaultCommandRunner` merges env via `{ ...process.env, ...opts?.env }` at `cloudflare-workers.ts:33`, so the child process inherits parent env plus dotenv vars without leaking back. `yaml.parse()` in `readReleaseManifest` replaces the naive regex parser. Dead code removal (`parseSecretsRef`/`resolveSecretsFilePath`) is clean.

### Axis B — DNA alignment

No issues. DNA-49 (fleet propagation) is strengthened — the health verdict fix enforces "content mismatch is a hard fail" as the DNA contract requires. `MODULE_CONTRACT` in `html.ts` updated to reflect hasher role. Forward-only — no compat shims.

### Axis C — Ecosystem fit

No issues. `hashHtml` name avoids collision with the separate `normalizeHtml` in `@gogol/share/text-normalize.ts` (which returns normalized HTML, not a hash). `yaml` package is already a dependency of `@gogol/site-kernel-handoff`.

### Axis D — Forward-only compliance

No issues. `normalizeHtml` renamed to `hashHtml` with no alias. `process.env` mutation removed entirely, not kept as fallback. Dead code deleted, not stubbed.

### Axis E — Agent-facing clarity

No issues. `hashHtml` is self-documenting — an agent calling it expects a hash. `workspaceRoot` in `HealthInput` makes the dependency explicit instead of relying on `process.cwd()`. AGENTS.md updated to reflect both changes.

### Axis F — Pragmatism

No issues. Each fix is a minimal single-purpose change. No speculative generality added.

### Axis G — Blind spots

**Minor (pre-existing):** The `stubRunner` in `cloudflare-workers.test.ts:14-16` ignores `opts` entirely — no test verifies that `secretsFilePath` results in env vars being passed to the child process via `opts.env`. The secret-redaction test at line 78-89 still sets `process.env.TEST_SECRET_VALUE` directly, which tests parent-env inheritance, not the dotenv-file path. This is a pre-existing gap, not a regression from this fix. Consider adding a test that asserts `runner` was called with `opts.env` containing dotenv vars when `secretsFilePath` is set.

### Spec compliance

No spec available — these are review-driven fixes, not spec-driven implementation. The prior review findings (G-1, E-1, E-2, A-1, A-2, G-3) are all addressed.

### Questions for the author

1. Should a test be added to verify that `secretsFilePath` contents are passed via `opts.env` to the runner, given the `stubRunner` currently ignores opts? (G — minor)
