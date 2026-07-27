---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: ebae414...HEAD
filesReviewed:
  - packages/ontology/src/operations/sternsystem.ts
  - packages/ontology/src/tests/sternsystem-owner.test.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts
  - packages/os/site-kernel-handoff/src/sternsystem/index.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts
  - packages/studio-gate/src/auth.ts
  - packages/studio-gate/package.json
  - packages/studio-gate/AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: ebae414...HEAD (RFC-0561 implementation)

### Verdict: Approved

The implementation is clean, minimal, and well-scoped. The `owner` field is added to the schema with proper regex validation, the `--owner` flag is wired through both registration paths (new + amend), `sternsystem.validate` produces notice-level warnings for missing owner, and `verifyOwnership` in Studio Gate reads the registry correctly. Two minor findings on description strings and error logging, neither blocking.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/ontology build:check`, `pnpm --filter @warpgogol/site-kernel-handoff build:check`, `pnpm --filter @warpgogol/studio-gate build:check`, `pnpm --filter @warpgogol/ontology test`, `pnpm --filter @warpgogol/site-kernel-handoff test` all pass. `rfc.validate RFC-0561` passes with 0 violations.

### Axis A — Structural correctness

- **Minor — bare catch blocks in `verifyOwnership`.** `packages/studio-gate/src/auth.ts:217` and `:221` have `catch` blocks that swallow the parse error without logging. While the function returns a structured error string (`registry-parse-error`), the actual parse error is lost. Consider adding `logger.warn` or including the error message in the result for debugging. Not blocking — the error strings are sufficient for the caller to handle.

### Axis B — DNA alignment

No issues. DNA-1 (no cross-app imports), DNA-42 (MODULE_CONTRACT/CHANGE_SUMMARY updated on all modified source files), DNA-51 (shared `writeRegistry` helper used for registry mutation).

### Axis C — Ecosystem fit

No issues. Package boundaries respected (`studio-gate → @warpgogol/ontology/operations` is a valid shared-library import). Ecosystem manifest regenerated. AGENTS.md files updated for both impacted packages. Command metadata updated in both `sternsystem.module.ts` and `index.ts`.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual paths. The optional `owner` field is a backwards-compatible extension as designed in the RFC — existing entries without `owner` remain valid. No legacy code paths maintained.

### Axis E — Agent-facing clarity

- **Minor — command description strings missing `[--owner]`.** `sternsystem.module.ts:33` description lists `Flags: --id, --cosmicStar, --repo, [--platform], [--mirror], [--amend], [--amend-id]` but not `[--owner]`. `index.ts:38` description is even more stale (missing `--mirror`, `--amend`, `--amend-id`, `--owner`). An agent reading the command description would not discover the `--owner` flag. Should add `[--owner]` to both description strings.

### Axis F — Pragmatism

No issues. No new commands — extended existing `sternsystem.register` with a flag. Schema extension is a single optional field. `verifyOwnership` is a focused function that reads the registry and compares — no over-engineering.

### Axis G — Blind spots

- **Minor — `did:web` regex restricts domain charset.** `packages/ontology/src/operations/sternsystem.ts:29` — `didWebRe = /^did:web:[a-z0-9.-]+#.+$/` only allows lowercase alphanumeric, dots, and hyphens in the domain part. Real `did:web` identifiers can include port numbers (`:port`) and paths (`/path`). However, the RFC specifically defines the format as `did:web:<domain>#<key-version>` for the pilot scope, and the domain is a simple domain without port/path. This is a deliberate scope decision, not a bug. If future VCs use port numbers or paths, the regex will need updating — but that's a future RFC concern.

### Spec compliance

| Requirement from RFC-0561 | Status | Evidence |
| --- | --- | --- |
| Optional `owner` field with `did:web` format validation | Done | `sternsystem.ts:68-72` — `owner: z.string().regex(didWebRe, ...).optional()` |
| `sternsystem.register` accepts `--owner` flag | Done | `sternsystem-register.ts:148` — `flagString(input, "owner")` |
| `--amend` backfill for existing entries | Done | `sternsystem-register.ts:165-169` — updates `entry.owner` and writes registry |
| `sternsystem.validate` passes with/without owner | Done | `sternsystem-validate.ts:142-151` — warning for missing, no violation |
| `sternsystem.validate` fails for malformed owner | Done | Zod schema parse in `readRegistry` enforces `didWebRe` |
| Studio Gate `verifyOwnership` function | Done | `auth.ts:201-249` — reads registry, checks `entry.owner` |
| Existing entries without owner remain valid | Done | `sternsystem.validate` passes with 1 warning, 0 violations |
| `rfc.validate` passes | Done | `rfc.validate RFC-0561` — 0 violations |

### Questions for the author

1. Should the command description strings in `sternsystem.module.ts` and `index.ts` be updated to include `[--owner]` for agent discoverability?
2. Should `verifyOwnership` log the actual parse error in the catch blocks for debugging, or are the structured error strings sufficient?
