---
id: RFC-0817
title: "Enforce formal mission lifecycle in mission.preview and add systemic pipeline reliability protections"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0814
amendedBy: []
related:
  - RFC-0480
  - RFC-0810
  - RFC-0753
satisfies: []
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - mission.preview
    - dns.record.upsert
    - executeKernelCommand
    - executePipelineForSite
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt
  - packages/werkstatt-site
successSignals:
  - "mission.preview auto-materializes when materializedAt === null, blocking dev server until formal lifecycle is satisfied"
  - "executeKernelCommand and executePipelineForSite --system/--site auto-inject detects --flag=value format and does not double-inject"
  - "dns.record.upsert returns exitCode 0 with skip summary when dns-records.yaml is absent"
  - "ownership.generator.cross-check runs in CI independent of mission.materialize"
  - "GENERATOR_OWNERSHIP_MAP conditional entries are validated by unit test"
nonGoals:
  - "Does not change the mission lifecycle order (open → materialize → validate → reconcile → close)"
  - "Does not add new pipeline steps to build.prepare"
  - "Does not remove --skip-prepare from mission.preview (still skips critical file check, but NOT materialization)"
  - "Does not auto-create dns-records.yaml for systems that do not need DNS records"
  - "Does not fix dns.record.validate graceful skip — it is not pipeline-integrated (only dns.record.upsert is in build.prepare)"
  - "Does not create a new ownership.generator.standalone-check command — the existing ownership.generator.cross-check is already workspace-scoped and callable directly via CLI"
---

# RFC-0817: Enforce formal mission lifecycle in mission.preview and add systemic pipeline reliability protections

## Context

During mission `warpgogol-com-m000051` close, four independent issues surfaced that were not caught earlier because the dev server bypasses the formal mission lifecycle. The dev server (`mission.preview`) runs from the workpiece with only a lightweight pre-dev critical file check, not the full `build.prepare` pipeline. This means ownership map gaps, conditional file mismatches, flag injection bugs, and pipeline step failures only appear at `mission.materialize` or `mission.close` inline validate time — potentially hours after the mission was opened.

## Problem

### 1. Dev server bypasses formal lifecycle

`mission.preview` (RFC-0480) checks `existsSync` for 3 dev-critical files and auto-generates them, but does not check `materializedAt`. A mission can be opened, dev server run for hours, and then fail at `mission.materialize` because `ownership.generator.cross-check` or `generated.files.validate` finds issues. The formal lifecycle is:

```
mission.open → mission.materialize → mission.validate → mission.reconcile → mission.close
```

But in practice, operators run:

```
mission.open → mission.preview (dev server) → ... → mission.close (fails at inline validate)
```

### 2. RFC-0814 `--system` double-injection

RFC-0814 auto-injects `--system <siteName>` into argv for workspace-scoped commands that accept a `system` flag. The guard checks `!wsArgv.includes("--system")`, which matches the bare `--system` token but NOT `--system=value` format. When an internal caller (e.g. `nachweis.validate`) passes `argv: ["--system=warpgogol-com"]`, the auto-inject adds `--system warpgogol-com` on top. `resolveCommandFlags` then produces `flags.system = ["warpgogol-com", "warpgogol-com"]` (array). `flagString` returns `undefined` for arrays, causing `bordbuch.validate` to throw `--system is required`.

### 3. `dns.record.upsert` throws when declaration file is absent

`dns.record.upsert` (RFC-0753) throws when `dns-records.yaml` does not exist in the cache clone. Not all systems have DNS records configured. The throw aborts the entire `build.prepare` pipeline. Pipeline-integrated workspace-scoped commands should skip gracefully when their input resource is absent, not abort the pipeline.

### 4. `GENERATOR_OWNERSHIP_MAP` gaps only caught at materialize time

`ownership.generator.cross-check` (RFC-0810) runs inside `build.prepare` pipeline. Missing entries in `GENERATOR_OWNERSHIP_MAP` are only caught when `mission.materialize` runs the full pipeline. There is no standalone CI check, so gaps accumulate until a mission is materialized.

## Decision

### A. `mission.preview` enforces materialization

`mission.preview` checks `materializedAt` in the mission manifest. If `null` and mission state is `open`, it auto-runs `mission.materialize` before starting the dev server. The `--skip-prepare` flag continues to skip the dev-critical file check but does NOT skip materialization. Materialization is the formal lifecycle gate; the dev-critical file check is a convenience layer on top.

### B. Fix RFC-0814 `--system` and `--site` pattern matching

The auto-inject guards for both `--system` and `--site` in `executeKernelCommand` (CLI path) and `executePipelineForSite` (pipeline path) use `Array.includes()`, which matches the bare `--flag` token but NOT `--flag=value` format. All four instances are replaced with a pattern check that detects both formats:

```ts
const hasSystemFlag = wsArgv.some((a) => a === "--system" || a.startsWith("--system="));
const hasSiteFlag = wsArgv.some((a) => a === "--site" || a.startsWith("--site="));
```

The same fix applies to the pipeline path in `executePipelineForSite` for both `--system` and `--site` injection.

### C. `dns.record.upsert` graceful skip

`dns.record.upsert` returns `exitCode: 0` with a skip summary when `dns-records.yaml` is absent, instead of throwing. This codifies the pipeline contract: workspace-scoped pipeline steps skip gracefully when their input resource does not exist.

### D. Add `ownership.generator.cross-check` to CI

The existing `ownership.generator.cross-check` command (RFC-0810) is already workspace-scoped and callable directly via `werkstatt run ownership.generator.cross-check --site <id>`. No new command is needed. Add it to the CI workflow (`.github/workflows/ci.yml`) to catch `GENERATOR_OWNERSHIP_MAP` gaps before any mission is opened.

### E. `GENERATOR_OWNERSHIP_MAP` conditional entries test

Add a unit test that verifies the `generated.files.validate` check respects `conditional: true` entries:

- When a `conditional: true` entry's file is absent from disk, `generated.files.validate` does NOT produce a `GEN-FILES-01` diagnostic.
- When a non-conditional entry's file is absent from disk, `generated.files.validate` DOES produce a `GEN-FILES-01` diagnostic. This tests the actual behavior of the validator rather than making circular claims about which generators "may not produce output."

## Architectural fit

- **No DNA invariant is enforced, protected, or extended by this RFC.** The formal mission lifecycle is an operational convention from RFC-0354/RFC-0480, not a DNA invariant. Hence `kind: policy`.
- **RFC-0480 (mission.preview):** Amended — preview now requires materialization.
- **RFC-0810 (ownership.generator.cross-check):** Extended — added to CI workflow.
- **RFC-0814 (--system/--site auto-inject):** Amended — pattern matching fix for both flags in both CLI and pipeline paths.
- **RFC-0753 (dns.record.upsert):** Amended — graceful skip.

## Design

### CLI surface

```sh
# mission.preview auto-materializes if needed
pnpm exec werkstatt run mission.preview --mission warpgogol-com-m000051

# --skip-prepare still skips dev-critical file check, but NOT materialization
pnpm exec werkstatt run mission.preview --mission warpgogol-com-m000051 --skip-prepare

# Ownership check in CI (existing command, no new command needed)
pnpm exec werkstatt run ownership.generator.cross-check --site warpgogol-com
```

### TypeScript contracts

```ts
// mission-preview.ts — materialization gate
interface MissionPreviewOptions {
  mission: string;
  port?: number;
  production?: boolean;
  skipPrepare?: boolean;
}

// execute-command.ts — fixed pattern matching (CLI path)
const hasSystemFlag = wsArgv.some((a) => a === "--system" || a.startsWith("--system="));
const hasSiteFlag = wsArgv.some((a) => a === "--site" || a.startsWith("--site="));

// execute-pipeline.ts — same fix (pipeline path)
// const hasSystemFlag = stepArgs.some((a) => a === "--system" || a.startsWith("--system="));
// const hasSiteFlag = stepArgs.some((a) => a === "--site" || a.startsWith("--site="));

// dns-record-upsert.ts — graceful skip (existing interface, unchanged)
// DnsRecordUpsertResult already exists at packages/werkstatt/src/dns/dns-record-upsert.ts:41-58.
// Only the handler behavior changes: return skip result instead of throwing.
interface DnsRecordUpsertResult {
  command: "dns.record.upsert";
  systemId: string;
  zone: string;
  dryRun: boolean;
  results: Array<{
    identity: string;
    action: "created" | "updated" | "skipped";
    recordId: string | null;
  }>;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    total: number;
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/mission/mission-preview.ts` | Add materialization gate before dev server start |
| `packages/werkstatt/src/kernel/runtime/execute-command.ts` | Fix `--system` and `--site` pattern matching in CLI auto-inject |
| `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` | Fix `--system` and `--site` pattern matching in pipeline auto-inject |
| `packages/werkstatt/src/dns/dns-record-upsert.ts` | Graceful skip when `dns-records.yaml` absent |
| `.github/workflows/ci.yml` | Add `ownership.generator.cross-check` step to CI |

### Failure modes

- **`mission.preview` + `materializedAt === null` + materialize fails:** Dev server does not start. Error message explains materialization failed and lists the failing pipeline step. `mission.materialize` is idempotent — a partial failure does not corrupt the workpiece; re-running materialize re-executes the full pipeline from the beginning. The workpiece may have partial output from the failed run, but materialize overwrites generated files on retry.
- **`mission.preview` + `materializedAt !== null`:** Dev server starts normally. No materialization re-run.
- **`mission.preview` + mission state `closed`/`aborted`:** No materialization check (preview works for any state per RFC-0480). Only `open` missions require materialization.
- **`dns.record.upsert` + no `dns-records.yaml`:** Returns exitCode 0, summary `"skipped — no dns-records.yaml"`. Pipeline continues.
- **`ownership.generator.cross-check` + missing entries:** Returns exitCode 1 with `OWN-XCHECK-01` diagnostics, same as pipeline-integrated version.

## Rollout

- **mission.preview materialization gate:** Default behavior on introduction. First `mission.preview` call for an unmaterialized open mission will run materialize (slow, ~60s). Subsequent calls are fast (`materializedAt` is set). `--skip-prepare` does NOT bypass this.
- **RFC-0814 pattern fix:** Immediate. No migration needed — the fix is backward-compatible (existing `--system` tokens still work, `--system=value` tokens are now detected).
- **`dns.record.upsert` graceful skip:** Immediate. Systems without `dns-records.yaml` now pass instead of failing.
- **CI ownership check:** Added to `.github/workflows/ci.yml`. Runs on every PR. Existing apps pass (the ownership map was fixed in m000051).
- **Conditional entries test:** Added to `packages/werkstatt-site` test suite.

## Alternatives considered

- **Auto-materialize on `mission.open`:** Rejected — materialization is heavy (~60s) and should be explicit. `mission.open` should be fast.
- **Block dev server entirely until materialize:** Rejected — `mission.preview` auto-materializing is more ergonomic than requiring a separate command.
- **Make `dns.record.upsert` a no-op step in the pipeline:** Rejected — the command should be callable directly. Graceful skip is the right behavior, not pipeline-level removal.
- **Add `--system` detection to `resolveCommandFlags` instead of auto-inject:** Rejected — the auto-inject is the right place to fix this, since it's the source of the duplicate.

## Risks

- **Performance:** First `mission.preview` for an unmaterialized mission is slow (~60s for materialize). Mitigated by caching — subsequent calls are fast.
- **False sense of safety:** Materialization passing does not guarantee `mission.validate` will pass. The dev server still uses `build.prepare.dev` (lighter pipeline). But materialization catches ownership map gaps and generated file issues, which are the most common close-time failures.
- **`dns.record.upsert` silent skip:** Systems that should have DNS records but are missing the file will silently skip. Mitigated by `dns.records.schema.validate` which can check for file presence if needed.

## Acceptance criteria

- [ ] `mission.preview` auto-runs `mission.materialize` when `materializedAt === null` and mission state is `open`
- [ ] `--skip-prepare` does NOT skip materialization
- [ ] `executeKernelCommand` and `executePipelineForSite` auto-inject detects `--system=value` and `--site=value` format and does not double-inject
- [ ] `dns.record.upsert` returns exitCode 0 with skip summary when `dns-records.yaml` is absent
- [ ] CI workflow (`.github/workflows/ci.yml`) includes `ownership.generator.cross-check`
- [ ] Unit test validates `GENERATOR_OWNERSHIP_MAP` conditional entries
- [ ] `AGENTS.md` updated with lifecycle enforcement rule
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0817` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0817 --reason "..." --invariant "DNA-N"` instead of working around it.
