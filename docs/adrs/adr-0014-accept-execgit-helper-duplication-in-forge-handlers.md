---
id: ADR-0014
title: "Accept execGit helper duplication in forge handlers"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-07-31
updatedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0625
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0014: Accept execGit helper duplication in forge handlers

## Context

Multiple forge OS handlers in `packages/forge/os/` each define their own `execGit` or `execGitLog` helper — a 5-10 line wrapper around `node:child_process.execFile("git", ...)` with timeout and stdout trimming. As of RFC-0625 implementation, these duplicates exist in:

- `os/rfc/handlers/implement-stamp.ts` — `execGit` (timeout 10s, trim)
- `os/rfc/verification-evidence.ts` — `execGit` (timeout 5s, trim)
- `os/rfc/handlers/validate-rules.ts` — `execGitLog` (timeout 10s, trim)
- `os/adr/handlers/validate.ts` — `execGitLog` (timeout 10s, trim)
- `os/compass/handlers/git-revision.ts` — uses `promisify(execFile)` variant

The pattern is identical across handlers but the timeout values and error-handling semantics vary slightly per use case.

## Decision

Accept the duplication of `execGit`/`execGitLog` helpers across forge handlers as a deliberate trade-off for handler autonomy and simplicity.

- No shared `os/utils/git.ts` utility will be created at this time.
- Each handler continues to define its own helper with its own timeout and error semantics.

## Justification

- **Triviality:** each helper is 5-10 lines — a `Promise` wrapper around `execFile` with `timeout`, `cwd`, and `trim()`. The cognitive overhead of duplication is lower than the indirection cost of a shared utility.
- **Handler autonomy (RFC-0556):** `os/compass/` and `os/werkstatt/` are fully autonomous — they must not import from `@warpgogol/*`. A shared `os/utils/git.ts` would need to respect this boundary, adding complexity.
- **Tuning per use case:** different handlers need different timeouts (5s for verification evidence, 10s for stamp and validation). A shared utility would need a timeout parameter, reducing the benefit.
- **Error semantics vary:** `implement-stamp.ts` needs exit-code-aware checks (`merge-base --is-ancestor`), while validation handlers only need stdout. A shared utility would need to expose both modes.
- **Not yet a pattern:** 4-5 occurrences is borderline. If the count grows to 8+ or the helpers gain non-trivial logic (retry, caching, streaming), extraction becomes worthwhile.

## Consequences

- **Positive:** each handler remains self-contained and readable — no indirection through a shared utility for a 5-line wrapper.
- **Positive:** timeout and error semantics are tuned per handler without parameter proliferation.
- **Negative:** if the git invocation pattern needs to change (e.g. adding `GIT_TERMINAL_PROMPT=0` env var), each handler must be updated individually.
- **Technical debt:** the duplication is knowingly accepted. If a 6th handler needs git access, revisit this decision.

## Evolution

Revisit this decision when:

- A 6th forge handler needs git invocation — at that point, extraction overhead is justified.
- The helpers gain non-trivial shared logic (retry with backoff, output parsing, env var management).
- A cross-handler bug reveals that inconsistent timeout/error semantics caused a production issue.

References: RFC-0625 implementation added `execGitLog` to `validate-rules.ts` and `validate.ts` (commits `e1fca65`, `85427b9`).
