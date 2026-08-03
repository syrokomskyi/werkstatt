---
rfcId: RFC-0655
auditId: AUDIT-RFC-0655-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0655

## Verdict: Needs revision

The RFC correctly identifies real consistency gaps in the release pipeline and proposes a sound validator. However, it misdiagnoses the root cause of the bordbuch `releaseId: null` problem — the existing `appendBordbuchEntry` API already accepts a top-level `releaseId` field, but `mission.close` passes it only in `metadata`. Additionally, the proposed `release-associated` bordbuch event kind is not in the closed `bordbuchEntryKindSchema` enum, and the `CloseReport` interface lacks the `releaseId` field the RFC's success signals reference.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0655 --json` reports zero violations.

## Axis A — Structural completeness

- **A1: `CloseReport` interface has no `releaseId` field.** The RFC's success signal says "close-report.json releaseId field is never null when mission.yaml releaseId is set." But the current `CloseReport` interface (`packages/os/site-kernel-handoff/src/mission/mission-close.ts:86-91`) has no `releaseId` field. The `close-report.json` file is written from `CloseReport` (line 441: `JSON.stringify(closeReport, null, 2)`), so it currently contains no `releaseId` at all. The RFC must explicitly call out adding `releaseId` to `CloseReport` as part of the `mission.close` changes, not just "appending a bordbuch entry."

## Axis B — DNA alignment

No issues. DNA-48 (release discipline), DNA-46 (mission lifecycle), and DNA-51 (Werkstatt consistency primitives) are all real invariants in `docs/architecture-dna.md` and the RFC body explains how each is enforced. The `satisfies[]` list matches `related[]` DNA entries.

## Axis C — Ecosystem fit

- **C1: `release-associated` is not a valid bordbuch event kind.** The closed enum `bordbuchEntryKindSchema` in `packages/ontology/src/operations/mission.ts:45-50` lists: `mission-open`, `mission-close`, `mission-abort`, `release-published`, `release-rolled-back`. There is no `release-associated` kind. The RFC must either (a) explicitly call out extending `bordbuchEntryKindSchema` in `@warpgogol/ontology`, or (b) drop the new event kind and fix the root cause (see C2).
- **C2: Root cause misdiagnosis — bordbuch `releaseId: null` is a calling-code bug, not a missing event kind.** The `BordbuchEntry` schema already has a top-level `releaseId: z.string().nullable()` field (line 73). The `appendBordbuchEntry` function accepts `releaseId` as a top-level option (see `bordbuch-append.ts:96-99`). But `mission-close.ts:260-271` passes `releaseId` only inside `metadata: releaseId ? { releaseId } : undefined`, NOT as the top-level `releaseId` option. This is why the bordbuch records `releaseId: null` — the field is never populated. The fix is a one-line change: add `releaseId` to the `appendBordbuchEntry` options object. No new event kind is needed.
- **C3: `release.prepare` does not currently read `close-report.json`.** The RFC says `release.prepare` updates `close-report.json` after writing `releaseId` to `mission.yaml`, but the current `release.prepare` code (`release-commands.ts:136-553`) never reads or writes `close-report.json`. The RFC should note the implementation detail: `release.prepare` must find, read, parse, update the `releaseId` field, and write back the existing `close-report.json` — and handle the case where it doesn't exist.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths. The RFC correctly states existing close-reports with `releaseId: null` are not modified retroactively — this is non-retroactive application, not a compatibility layer.

## Axis E — Agent-facing policy

No issues. Status is `draft`, no self-authorizing language. Implementation notes reference RFC-0224 and RFC-0334 correctly. All acceptance criteria are code changes an agent can make.

## Axis F — Pragmatism

- **F1: `release-associated` bordbuch entry is redundant.** The existing `mission-close` bordbuch entry already has a top-level `releaseId` field in the schema. Once C2 is fixed (passing `releaseId` as a top-level option to `appendBordbuchEntry`), the `mission-close` entry will always carry the correct `releaseId`. A separate `release-associated` event adds noise without new information.
- **F2: Check 4 (`bordbuch-release-id-consistent`) becomes trivially satisfied after C2 fix.** If `mission.close` always writes the correct `releaseId` to the bordbuch's top-level field, the bordbuch and `mission.yaml` will always agree at close time. The only divergence scenario is when `release.prepare` runs after close and writes a new `releaseId` to `mission.yaml` — but the bordbuch `mission-close` entry correctly reflects the state at close time (which may be `null`). The validator should check whether the bordbuch `releaseId` matches the `mission.yaml` `releaseId` at close time, not after `release.prepare` changes it.

## Axis G — Blind spots

- **G1: Missing edge case — no `close-report.json` exists.** Missions closed before RFC-0477 (which introduced `close-report.json`) have no `close-report.json` at all. The validator (check 2) and `release.prepare`'s update logic must handle this gracefully — warn, not error.
- **G2: `release.prepare` updating `close-report.json` may race with `mission.close`.** If a mission is re-opened and closed again after `release.prepare` has already written a `releaseId` to `close-report.json`, the second close will overwrite `close-report.json` with a new report that has `releaseId: null`. The RFC's rollout section mentions re-opened missions but doesn't address this specific interaction.

## Questions for the author

1. Why add a `release-associated` bordbuch event kind when the existing `mission-close` entry already has a top-level `releaseId` field that is simply not being populated by the current calling code? Would fixing the root cause (passing `releaseId` to `appendBordbuchEntry` as a top-level option) eliminate the need for a new event kind?
2. Should `releaseId` be added to the `CloseReport` interface so that `close-report.json` carries it as a first-class field, or should the success signal be reworded to reference the `MissionCloseData.releaseId` field (which is in the command output but not in the written file)?
3. How should `release.prepare` handle the case where `close-report.json` doesn't exist (mission closed before RFC-0477)? Should it create one, skip the update, or warn?
