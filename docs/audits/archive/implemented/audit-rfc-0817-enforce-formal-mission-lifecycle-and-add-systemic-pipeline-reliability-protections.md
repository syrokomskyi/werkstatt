---
rfcId: RFC-0817
auditId: AUDIT-RFC-0817-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0817

## Verdict: Needs revision

The RFC addresses four real problems but has a critical DNA alignment error (`satisfies: [DNA-12]` references a merged-away invariant), an incomplete `--system` fix (only CLI path, not pipeline path, and `--site` has the same bug), and a potentially redundant new command (`ownership.generator.standalone-check` when `ownership.generator.cross-check` is already callable standalone).

## Mechanical validation (rfc.validate)

Pass with 1 warning:
- **V-19 (warning):** `RFC-0817.amends includes RFC-0814, but RFC-0814.amendedBy does not include RFC-0817`. This will be resolved during enhance (add `RFC-0817` to RFC-0814's `amendedBy`).

## Axis A — Structural completeness

- **Missing `Output format` section:** The RFC introduces `ownership.generator.standalone-check` but does not document its `--json` output shape. The existing `ownership.generator.cross-check` returns `CheckResult` diagnostics — the new command should document whether it follows the same shape.
- **`DnsRecordUpsertResult` is existing, not new:** The TypeScript contracts section shows `DnsRecordUpsertResult` (lines 156-173) as if it's a new type, but it already exists at `packages/werkstatt/src/dns/dns-record-upsert.ts:41-58`. The RFC should note that only the graceful-skip behavior changes, not the type itself.
- **`MissionPreviewOptions` is new but trivial:** The interface at lines 143-148 is a simple options bag. It's fine, but the RFC should clarify whether this is a new exported type or just illustrative.

## Axis B — DNA alignment

- **CRITICAL — DNA-12 is invalid:** `satisfies: [DNA-12]` references DNA-12, which per `docs/architecture-dna.md:51-53` is "Merged into DNA-9" and explicitly states "Do not reference DNA-12 as a separate invariant." The RFC body at line 118 says "DNA-12 (Formal lifecycle)" but DNA-12 is about centralized visibility control, not the formal mission lifecycle. The formal lifecycle (`mission.open → mission.materialize → …`) is not explicitly a DNA invariant — it's an operational convention from RFC-0354/RFC-0480. **Fix:** Either reference DNA-9 (the actual invariant DNA-12 merged into), or remove `satisfies` entirely and change `kind` to `policy` (since no new DNA invariant is established or enforced — the RFC strengthens an existing operational convention, not a DNA invariant).

## Axis C — Ecosystem fit

- **`ownership.generator.cross-check` is already standalone-callable:** The existing command (`packages/werkstatt-site/src/checks/ownership-cross-check.ts:36-125`) is workspace-scoped and uses `listRegisteredKernelCommands(context.workspaceRoot)` — it can already be invoked directly via `werkstatt run ownership.generator.cross-check --site warpgogol-com`. The RFC proposes a new `ownership.generator.standalone-check` command but does not justify why the existing command cannot simply be added to the CI workflow. If the existing command works standalone, the new command is redundant — just add `ownership.generator.cross-check` to CI. If a wrapper is needed (e.g., to pass `--site` without requiring a mission), the RFC should explain the difference.
- **`dns.record.validate` has the same throw pattern:** `packages/werkstatt/src/dns/dns-record-validate.ts:56-58` throws when `dns-records.yaml` is absent, identical to `dns.record.upsert`. If `dns.record.validate` is also in the `build.prepare` pipeline, it needs the same graceful skip. The RFC only lists `dns.record.upsert` in `commands.changed` — it should either fix `dns.record.validate` too, or confirm that `dns.record.validate` is not pipeline-integrated.
- **`--site` injection has the same `includes()` bug:** `execute-command.ts:402` uses `!wsArgv.includes("--site")` and `execute-pipeline.ts:755` uses `!stepArgs.includes("--site")`. Both have the same `--site=value` double-injection vulnerability. The RFC only fixes `--system` — it should fix `--site` too or explain why `--site=value` format is never used in practice.

## Axis D — Forward-only compliance

No issues. The RFC amends four existing RFCs directly (RFC-0480, RFC-0810, RFC-0814, RFC-0753) without introducing backward compatibility layers or dual paths.

## Axis E — Agent-facing policy

- No self-authorizing language found. Status gate is respected.
- Implementation notes reference correct governance rules (RFC-0224, verification emit, supersede escalation).
- No `NEEDS CLARIFICATION` markers found.

## Axis F — Pragmatism

- **`--system` fix is incomplete — pipeline path not fixed:** The RFC fixes `--system` pattern matching only in `executeKernelCommand` (CLI path, `execute-command.ts:407`). The same `!stepArgs.includes("--system")` bug exists in the pipeline path (`execute-pipeline.ts:760`). If an internal caller passes `--system=value` in step args, the pipeline path would double-inject. The RFC should fix both locations.
- **`--site` fix omitted:** The same `includes()` pattern is used for `--site` injection in both paths (`execute-command.ts:402`, `execute-pipeline.ts:755`). The RFC should fix all four instances (`--site` and `--system` in both CLI and pipeline paths) with the same `some(a => a === "--flag" || a.startsWith("--flag="))` pattern, or explain why `--site` doesn't need the fix.
- **New command may be redundant:** As noted in Axis C, `ownership.generator.standalone-check` may duplicate `ownership.generator.cross-check`. Prefer adding the existing command to CI over creating a new command.

## Axis G — Blind spots

- **`dns.record.validate` not mentioned:** Same throw-on-missing-file pattern. If pipeline-integrated, needs the same graceful skip fix.
- **Auto-materialize failure mode:** The RFC says "Dev server does not start" if materialize fails (line 188), but doesn't discuss whether a failed materialize leaves the workpiece in a half-materialized state. `mission.materialize` runs a multi-step pipeline — if step 3 of 30 fails, the workpiece has partial output. A subsequent `mission.preview` call would see `materializedAt === null` and re-run materialize, but the partial state might cause different failures. The RFC should address whether `mission.materialize` is idempotent or whether the workpiece needs cleanup before retry.
- **`conditional` test is potentially tautological:** The proposed unit test (section E, lines 111-114) verifies that entries marked `conditional: true` "correspond to generators that may not produce output on every run." But the test would need an external oracle to determine which generators are conditional — which is the same data it's validating. The test is only meaningful if it checks something concrete: e.g., that `generated.files.validate` does NOT produce `GEN-FILES-01` diagnostics for absent `conditional: true` entries, or that the `conditional` field is present on entries whose generators are known to be conditional by nature (image/video variants, bordbuch projections, etc.). The RFC should specify the test's verification mechanism.
- **CI workflow integration not specified:** The RFC says "Add it to the CI workflow" (line 107) but doesn't specify which workflow file (`.github/workflows/ci.yml`?) or whether the check should run on all PRs or only when `packages/werkstatt-site/src/checks/generator-ownership.ts` changes.

## Questions for the author

1. Why does `satisfies` reference DNA-12 when `docs/architecture-dna.md` explicitly says "Do not reference DNA-12 as a separate invariant"? Should this be DNA-9, or should `kind` change to `policy` with no `satisfies`?
2. Why does the `--system` fix only cover the CLI path (`executeKernelCommand`) and not the pipeline path (`executePipelineForSite`)? And why isn't `--site` injection fixed with the same pattern, given it has the identical `includes()` bug?
3. Why is a new `ownership.generator.standalone-check` command needed when `ownership.generator.cross-check` is already workspace-scoped and callable directly via `werkstatt run ownership.generator.cross-check --site <id>`? Would adding the existing command to CI achieve the same goal?
