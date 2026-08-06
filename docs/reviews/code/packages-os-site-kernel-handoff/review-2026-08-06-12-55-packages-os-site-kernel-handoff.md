---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 3697aed6...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts
  - packages/os/site-kernel-handoff/src/nachweis/index.ts
  - packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/command-manifest.generated.yaml
---

# Code Review: RFC-0714 implementation (3697aed6...HEAD)

## Verdict: Needs revision

The implementation is functionally correct — typecheck passes, all 28 nachweis tests pass, and both commands follow established patterns. Two findings require attention: a missing `logger.warn` call pattern and a minor contract mismatch in the TypeScript interface.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` exits 0. `pnpm --filter @warpgogol/site-kernel-handoff test` passes all 28 nachweis tests (4 pre-existing failures in `mission-close-state-file.test.ts` are unrelated).

## Axis A — Structural correctness

- **Duplicated Code (minor)** — `flagString` and `flagBool` helper functions are duplicated across `nachweis-approve.ts:41-47`, `nachweis-public-derivative.ts:48-56`, `nachweis-publish.ts:46-54`, and `nachweis-consent.ts:41-44`. These are identical helpers that could be extracted to `nachweis-io.ts`. However, this is a pre-existing pattern — the new files follow the established convention. No action needed for this RFC.

## Axis B — DNA alignment

No issues. The diff touches the Nachweis module which operates under DNA-59 (Evidence preservation) — both commands use R2 storage via the existing `uploadToR2` helper and Bordbuch audit trail, consistent with the DNA-59 invariant.

## Axis C — Ecosystem fit

No issues. Both commands are registered in `createNachweisModule` with correct flags, scopes, and mutability declarations. The command manifest is regenerated. AGENTS.md is updated with the Nachweis lifecycle section.

## Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths introduced. The RFC amends RFC-0707 by adding new commands without modifying existing ones.

## Axis E — Agent-facing clarity

- **Finding E-1 (minor)** — `nachweis-approve.ts` and `nachweis-public-derivative.ts` both carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks, following the established pattern. However, the `MODULE_CONTRACT` in `nachweis-approve.ts` lists `Emits logger.warn if no evidence-source file is found` as a responsibility but does not mention the `--json` flag support. The `--json` flag is registered in the module but not documented in the contract. This is consistent with existing handlers (e.g. `nachweis-consent.ts` also does not document `--json` in its contract), so this is a pre-existing pattern, not a new gap.

## Axis F — Pragmatism

- **Finding F-1 (minor)** — The `NachweisApproveResult` interface in the RFC (line 162) declares `bordbuchEventId: string` (non-nullable), but the implementation in `nachweis-io.ts:130` declares `bordbuchEventId: string | null` (nullable). This is because `--dry-run` returns `null` for the bordbuch event ID. The implementation is correct (the RFC contract was slightly idealistic), but the RFC text should be updated to match. This is a documentation mismatch, not a code bug.

## Axis G — Blind spots

- **Finding G-1 (minor)** — `nachweis.public-derivative` reads the entire PDF file into memory via `fs.readFile` before uploading. For large PDFs, this could be a memory concern. However, the AGENTS.md notes that individual files are under the 5 MB threshold (RFC-0707 non-goal), so this is acceptable for the pilot.
- **Finding G-2 (minor)** — `nachweis.approve` does not verify that the `--verification-level` value is within the allowed set (N0, N1, N2, N3). Any string is accepted. The RFC design explicitly states the operator is responsible for passing the correct level (Risk: "Verification level gaming"), so this is by design. The Bordbuch entry records what was passed for audit.

## Spec compliance

| Requirement from RFC-0714 | Status | Evidence |
| --- | --- | --- |
| `nachweis.approve` handler created | Done | `nachweis-approve.ts:49` |
| `nachweis.public-derivative` handler created | Done | `nachweis-public-derivative.ts:58` |
| Both commands registered in module | Done | `nachweis.module.ts:168,200` |
| Bordbuch entry with "approved" summary + metadata | Done | Test at `nachweis-commands.test.ts:686-730` |
| R2 upload + `items.public.storage: "public"` | Done | Test at `nachweis-commands.test.ts:852-901` |
| Idempotency by SHA-256 | Done | Test at `nachweis-commands.test.ts:904-943` |
| Entitlement skip | Done | Test at `nachweis-commands.test.ts:671,815` |
| `--dry-run` support | Done | Test at `nachweis-commands.test.ts:733,946` |
| `--json` support | Done | `nachweis.module.ts:192,220` |
| Command manifest updated | Done | `docs/command-manifest.generated.yaml:13767,14041` |
| AGENTS.md workflow docs | Done | `packages/os/site-kernel-handoff/AGENTS.md:347-354` |
| `rfc.validate` passes | Done | Exit code 0, 1 warning (V-19 amendedBy backreference) |

## Questions for the author

1. Should `NachweisApproveResult.bordbuchEventId` in the RFC text (line 162) be updated to `string | null` to match the implementation, or should the `--dry-run` path return a placeholder string instead of `null`?
2. Should `nachweis.approve` validate the `--verification-level` input against the allowed set (N0–N3), or is the operator-responsibility design sufficient for the pilot?
