---
rfcId: RFC-0734
auditId: AUDIT-RFC-0734-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0734

## Verdict: Needs revision

The RFC is architecturally sound and well-integrated with RFC-0732, but has several design gaps that must be resolved before implementation: `mission.close` lacks a `--skip-content-regression` flag (the RFC references it but it doesn't exist in the command registration), `review.generate` mission ID resolution from `--site` is unexplained, DNA-63 was prematurely added to `docs/architecture-dna.md` before the RFC is accepted, and the `mission.close` enforcement section ambiguously says "Build current snapshot" without clarifying whether this means rebuilding from source or loading the existing `current.snapshot.yaml`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0734 --json` returns zero violations.

## Axis A — Structural completeness

- **No "Output format" section.** RFC-0732 has a dedicated "Output format" section documenting the `--json` shape. RFC-0734 shows the review.yaml format but does not document the `--json` output shape for `review.generate` or `apply`. The acceptance criteria require the file path in the command output, but the RFC doesn't specify whether this is in `summary`, `data`, or both.
- **No "Failure modes" section.** RFC-0732 has a "Failure modes" section specifying exit codes and warn-vs-fail behavior for each CREG rule. RFC-0734 introduces CREG-04 and CREG-05 but documents their behavior only in the "Diagnostic rules" table and scattered design paragraphs. A consolidated "Failure modes" section is needed.
- **`review.generate` mission ID resolution unexplained.** The command takes `--site <name>` (app scope) but writes to `missions/{missionId}/evidence/content-regression/review.yaml`. The RFC does not explain how the command resolves the mission ID from the site ID. The registry has a `currentMission` field (e.g. `warpgogol-com-m000035`), but the RFC doesn't reference this mechanism.
- **`apply` stale detection mechanism underspecified.** The RFC says `apply` "re-builds the current snapshot and compares against the review.yaml's `currentSnapshotHash`." But the `ContentRegressionSnapshot` type (from RFC-0732) has a `contentHash` field, not a `currentSnapshotHash` field. The review manifest's `currentSnapshotHash` is a new field — the RFC should clarify that it is the sha256 of the `current.snapshot.yaml` file content (or the `contentHash` field within it).

## Axis B — DNA alignment

- **DNA-63 prematurely added.** `docs/architecture-dna.md:267-269` already contains a DNA-63 entry referencing RFC-0734. The RFC's acceptance criterion (line 541) says "DNA-63 entry added to `docs/architecture-dna.md`" — but it's already there. The DNA entry was added before the RFC was accepted, which violates the normal flow (DNA entries are added during implementation of the establishing RFC). The entry should either be removed and re-added during implementation, or the acceptance criterion should be updated to "verify DNA-63 entry exists and references this RFC."
- **`satisfies: [DNA-63]` is correct** — DNA-63 is listed in `satisfies[]` and the RFC body explains how it establishes DNA-63 (content regression review discipline). Good.
- **DNA-46 (mission lifecycle) referenced in body but not in `satisfies[]`.** The "Architectural fit" section says "DNA-46 (mission lifecycle) — aligned" but DNA-46 is not in `satisfies[]`. This is fine — `satisfies[]` is for invariants the RFC implements/protects/extends, and DNA-46 is only aligned, not extended. No action needed, but the distinction should be clear.

## Axis C — Ecosystem fit

- **`mission.close` does not have `--skip-content-regression` flag.** The RFC's `mission.close` enforcement section (line 396) says "If `--skip-content-regression` was used during the mission: skip CREG-05 check, copy unconditionally." But `mission.close` command registration (`packages/os/site-kernel-handoff/src/mission/index.ts:101-127`) does not include a `--skip-content-regression` flag. The flag exists only on `mission.validate`. The RFC must either: (a) add `--skip-content-regression` to `mission.close` flags, or (b) explain how `mission.close` detects that the flag was used during `mission.validate` (e.g. via state file, bordbuch entry, or absence of `current.snapshot.yaml`).
- **`commands.changed` lists `mission.close` — correct.** The current `mission.close` unconditionally copies `current.snapshot.yaml` to golden (`mission-close.ts:600-625`). RFC-0734 changes this to conditional copy. This is a real change to an existing command.
- **Module placement consistent** — new code in `packages/os/site-kernel-checks/src/content-regression.ts` alongside existing RFC-0732 code. Good.
- **No Compass document synchronization section.** RFC-0732 has a "Compass document synchronization" section listing `docs/verification-plan.xml` and `docs/development-plan.xml` updates. RFC-0734 adds two new commands and two new diagnostic rules but does not mention Compass sync. The `fo-doc-audit` step during implementation may handle this, but the RFC should at least acknowledge it.

## Axis D — Forward-only compliance

No issues. The RFC is strictly additive — new commands, new diagnostic rules, and a behavior change to `mission.close` that adds a blocking check. `content.regression.snapshot.update` remains functional (not deprecated, not removed). No backward compatibility layers or dual-paths.

## Axis E — Agent-facing policy

- **Status gate correct.** Line 547: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Good.
- **Implementation notes reference correct governance** — RFC-0224 (accepted→implemented), RFC-0330 (verification evidence). Good.
- **No self-authorizing language.** Good.
- **No `NEEDS CLARIFICATION` markers.** Good.
- **Storage policy** — review.yaml is a plain YAML file in the mission evidence directory. No cookies, no client-side persistence. Good.

## Axis F — Pragmatism

- **`versionBump: patch` may be incorrect.** The RFC changes `mission.close` behavior: missions with unreviewed content drift that previously closed successfully will now be blocked by CREG-05. This is a behavior change that can break existing operator workflows. The versionBump rules say "minor (Breaks-B, requires migrator)" — CREG-05 blocking is arguably a Breaks-B change. The RFC justifies `patch` as additive, but the `mission.close` behavior change is not purely additive for operators who have content drift.
- **Two new commands earn their existence.** `review.generate` produces a fundamentally different artifact (reviewable YAML with golden/current values) vs. `snapshot.update` (atomic bulk accept). `apply` processes the review file with per-change decisions. Neither could be a flag on an existing command.
- **`nonGoals` are meaningful** — HTML report, interactive UI, LLM fixing, per-block golden updates, cross-language parity. All are real alternatives that were considered and rejected. Good.

## Axis G — Blind spots

- **Performance of `review.generate` not mentioned.** `review.generate` calls `buildSnapshot` which calls `loadSemanticSiteModel` for each language — same cost as `content.regression.check` (~150-300ms for a medium site). The RFC doesn't mention this. RFC-0732 has a "Performance estimate" section; RFC-0734 should at least reference it.
- **`mission.close` enforcement: "Build current snapshot" is ambiguous.** Line 392 says "Build current snapshot" as step 1 of the enforcement logic. Does this mean calling `buildSnapshot()` from scratch (adding ~150-300ms to `mission.close`), or loading the existing `current.snapshot.yaml` file that was written during `build.check`? The current code just checks `existsSync(contentRegressionSrc)` and copies. The RFC should clarify: load existing snapshot (cheap) vs. rebuild (expensive).
- **FAQ changes in review manifest.** `ContentRegressionReviewChange` has `kind: "faq"` but the existing `diffSnapshots` function only produces `faqChanged: boolean` on `ContentRegressionRouteDiff` — it doesn't produce per-FAQ-entry diffs. The RFC doesn't explain how `review.generate` extracts individual FAQ changes into review manifest entries. This is an implementation gap.
- **`apply` verification mechanism underspecified.** For `reject` decisions, the RFC says "compare current workpiece content against golden value; if they still differ, emit CREG-04." But the comparison is at the snapshot block level (heading, lead, body, items), not at the source `.md` file level. The `apply` command would need to build the current snapshot, find the specific block by `blockId`, and compare the specific `field` value. The RFC describes this at a high level but doesn't specify the exact lookup mechanism (route → block → field → value).

## Questions for the author

1. How does `review.generate` resolve the mission ID from `--site`? Does it read `currentMission` from `systems/registry.yaml`, or does it require a `--mission` flag?
2. How does `mission.close` detect that `--skip-content-regression` was used during `mission.validate`? Does `mission.close` need its own `--skip-content-regression` flag, or does it rely on the absence of `current.snapshot.yaml`?
3. Should `versionBump` be `minor` instead of `patch`, given that CREG-05 can block `mission.close` for missions that previously closed successfully?
4. Does `mission.close` enforcement rebuild the snapshot from scratch or load the existing `current.snapshot.yaml`? The performance implications differ significantly.
