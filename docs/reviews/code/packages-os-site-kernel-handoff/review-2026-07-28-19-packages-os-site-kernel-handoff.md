---
reviewId: REVIEW-CODE-2026-07-28-01
date: 2026-07-28
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: fda6a34...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-preview.ts
  - packages/os/site-kernel-handoff/src/mission/mission.module.ts
  - packages/os/site-kernel-handoff/src/mission/index.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: fda6a34...HEAD (ADR-0007 implementation)

### Verdict: Needs revision

The implementation correctly adds `content.ref-index.generate` before the dev server start, but silently swallows subprocess failures — if the index regeneration fails, the dev server starts with a stale index, which is the exact problem ADR-0007 was meant to prevent.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` exits 0.

### Axis A — Structural correctness

**Finding A-1: Swallowed subprocess error.** `mission-preview.ts:75-79` — the `spawnSync` call for `content.ref-index.generate` does not check `result.status` or `result.error`. If the subprocess fails (e.g., site not found, broken content file, missing `site-kernel` binary), the dev server starts with a stale index and the operator sees no warning. This defeats the purpose of ADR-0007. Add a check:

```ts
const result = spawnSync(
  "pnpm",
  ["exec", "site-kernel", "run", "content.ref-index.generate", "--site", manifest.systemId],
  { cwd: workspaceRoot, stdio: "inherit" },
);
if (result.status !== 0) {
  logger.warn(`  [ADR-0007] content.ref-index.generate exited with code ${result.status} — index may be stale`);
}
```

A warning (not a hard throw) is appropriate here because `mission.preview` is a dev convenience command — blocking the dev server on a regeneration failure would be too aggressive for iterative work.

### Axis B — DNA alignment

No issues.

### Axis C — Ecosystem fit

No issues. Command metadata (`writes` field) updated correctly in both `mission.module.ts` and `index.ts`. AGENTS.md updated. Generated manifests regenerated.

### Axis D — Forward-only compliance

No issues.

### Axis E — Agent-facing clarity

No issues. Compass scaffolding (`CHANGE_SUMMARY`) updated with ADR-0007 reference. Inline comment references ADR-0007.

### Axis F — Pragmatism

No issues. Minimal change, extends existing command, no new command introduced.

### Axis G — Blind spots

**Finding G-1: Same as A-1.** If `content.ref-index.generate` fails silently, the operator has no indication that the index is stale. The ADR's "Positive" consequence ("dev server always renders current frontmatter values") is not guaranteed without error checking.

**Question G-2: Site resolver for closed/aborted missions.** `mission.preview` works for closed and aborted missions (RFC-0480). When `content.ref-index.generate --site <systemId>` is called, the kernel's site resolver resolves the site directory. For an active mission, this resolves to the workpiece. For a closed/aborted mission, does the resolver still resolve to the workpiece, or does it fall back to `systems/<id>/`? If the latter, the regenerated index would be written to the wrong location and the dev server (running from the workpiece) would not see it.

### Spec compliance

| Requirement from ADR-0007 | Status | Evidence |
| --- | --- | --- |
| Run `content.ref-index.generate` before dev server start | Done | `mission-preview.ts:75-79` |
| Scope limited to `content.ref-index.generate` | Done | No other `build.prepare` steps invoked |
| Generation runs against workpiece directory | Partial | Uses `--site <systemId>` which resolves via mission-aware site resolver; unverified for closed/aborted missions (G-2) |

### Questions for the author

1. Should `content.ref-index.generate` failure block the dev server start, or is a warning sufficient? (A-1)
2. Does the site resolver correctly resolve to the workpiece for closed/aborted missions? (G-2)
