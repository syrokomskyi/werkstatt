---
id: RFC-0203
title: "Adopt a canonical Diagnostic model for all static checks"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-18
updatedAt: 2026-06-18
implementedAt: 2026-06-18
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0233
related:
  - RFC-0029
  - RFC-0030
  - RFC-0074
  - RFC-0086
  - RFC-0201
commands:
  proposed:
    - diagnostic.shape.lint
  added:
    - diagnostic.shape.lint
  changed:
    - uni.registry.validate
    - biome.tokens.validate
    - kernel.result.envelope.lint
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel
  - packages/os/site-kernel-checks
successSignals:
  - "Every static check reports findings as a `Diagnostic[]` carrying a registered `ruleId`, a `severity`, a human message, an optional `file:line:column` locator, and an optional imperative `fixHint`."
  - "The central failure renderer (RFC-0086) prints one stable, greppable line per diagnostic plus a `fix:` line, so an AI agent can locate and repair a violation without parsing free-form prose."
  - "New checks cannot regress to bare `violations: string[]` with unregistered rule ids — `diagnostic.shape.lint` flags it in the pipeline."
  - "The console output of `build.check` is deterministic run-to-run: diagnostics are sorted by severity, file, line, then ruleId."
nonGoals:
  - "Do not implement SARIF emission or GitHub Code Scanning upload in this RFC — it is an explicitly deferred boundary adapter."
  - "Do not rewrite all ~97 check files in one change; migration is phased behind a compatibility shim."
  - "Do not change which conditions are errors vs. warnings for any existing rule — this RFC standardizes shape, not severity policy."
  - "Do not introduce a new finding superschema separate from the existing audit finding — the canonical model is the promoted `auditFindingSchema`."
  - "Do not add a browser, network, or AST dependency to any check as part of this work."
---

# RFC-0203: Adopt a canonical Diagnostic model for all static checks

## Context

The ecosystem already runs a large body of static checks through `pnpm build:check` (`turbo run build:check`) and `packages/os/site-kernel-checks`. There are roughly 90 check modules today and the population is still growing (PSEO, people, living-photos, biome-tokens, lagebild, integration, …). This is a strength: most architectural invariants are guarded by a deterministic command rather than by manual review.

The weakness is that there is no single shape for a _finding_. The outer envelope is already unified and protected — every command returns `KernelCommandResult` (`{ data?, exitCode?, summary? }`, `packages/os/site-kernel/src/types.ts`) and `kernel.result.envelope.lint` (KEL, RFC-0030) prevents regression to the flat `{ command, status, violations }` return that bypassed exit codes. But the _inner_ finding shape has diverged into at least three parallel worlds:

| Shape | Where | Inner record |
| --- | --- | --- |
| `violations: string[]` | ~97 modules via `resultFromViolations` / `failResult` (`packages/os/site-kernel-checks/src/result-helpers.ts`) | a human string; `ruleId`, `severity`, `file`, `line` are all baked into prose |
| `auditFindingSchema` | RFC-0074 audit / `app.qa.validate` (`packages/os/site-kernel-checks/src/audit/types.ts`) | `{ id, ruleId, severity, file, line, message, evidence[], suggestion }` |
| bespoke per-check | e.g. `UniRegistryValidateViolation` (`packages/os/site-kernel-checks/src/registry.ts`), `BiomeTokenViolation` (RFC-0201) | hand-rolled `{ kind, …, detail }` / `{ rule, severity, file, … }` |

The cost of this divergence is already visible in the kernel itself. RFC-0086 added a central failure renderer, `formatFailureDiagnostics` (`packages/os/site-kernel/src/runtime.ts`), whose job is to print actionable items when a command fails. Because producers are not uniform, the renderer has to _sniff_ four candidate arrays in precedence order — `diagnostics → violations → findings → details` — and duck-type each item for `ruleId | rule | severity`, `file | path | target`, and `message`. That sniffing is the clearest evidence that the finding shape should be unified: the consumer is paying, every run, for the absence of a contract.

## Problem

The unprotected invariant is: **a check finding has no canonical, machine-readable shape, and no stable identifier.**

Concretely:

- The dominant path (`resultFromViolations(command, string[])`) emits _strings_. There is no structured `ruleId`, `severity`, `file`, or `line` field — a downstream consumer (CI annotation, IDE, dashboard, or an AI agent) must parse free-form text, which is brittle and check-specific.
- There is no rule-id registry. Ids that do exist are coined ad hoc and inconsistently: `KEL-01`, `NEW/STALE/CHANGED`, `BIOME-TOKEN-02`, or nothing at all. There is no way to enumerate "what rules can this ecosystem emit", dedupe a finding, baseline it, or link it to a description.
- The central renderer (RFC-0086) drops the most agent-useful field. `auditFindingSchema` carries `suggestion`, and RFC-0201's violations carry `fixHint`, but `formatDiagnosticItem` only prints `ruleId · file · message` — the remediation never reaches the console. An AI agent reading `build.check` output sees _what_ is wrong but not _how to fix it_, even when the producing check already knows.
- Output is not guaranteed deterministic. Order depends on each check's internal iteration, so console diffs are noisy and caching/baselining is impossible.

This is foundational and it gets more expensive over time: every new check written in the string-violation style enlarges the migration surface and deepens the renderer's dependence on shape-sniffing.

## Decision

The workspace adopts a single canonical finding model, the **`Diagnostic`**, promoted directly from the existing `auditFindingSchema` (RFC-0074). Specifically:

1. The TypeScript contract `Diagnostic` graduates into `@gogol/site-kernel` (next to `KernelCommandResult`), and `packages/os/site-kernel-checks` re-expresses `auditFindingSchema` as the zod realization of that contract. The audit finding is not replaced by a new superschema — it _is_ the canonical Diagnostic, generalized.
2. The severity vocabulary is standardized to `error | warning | info` across the ecosystem (folding the audit `warn` spelling into `warning`).
3. A lightweight **rule-id registry** is introduced. Every emitted `ruleId` must be a registered, stable identifier with a title.
4. The central failure renderer (RFC-0086) is upgraded to render a `Diagnostic` deterministically, including a `file:line:column` locator and a `fix:` line derived from `fixHint`, so the console output is directly actionable by an AI agent.
5. A new governance command `diagnostic.shape.lint` guards the inner shape, the way KEL (RFC-0030) guards the outer envelope. It is additive: KEL keeps protecting the envelope; the new lint protects diagnostics + registered ids.
6. `resultFromViolations(command, string[])` is preserved as a **compatibility shim**: it wraps each bare string into a `Diagnostic { ruleId: <command>, severity: "error", message }`. Nothing breaks on day one; migration is incremental.

**SARIF is explicitly deferred.** SARIF is an _interchange_ format; its value is at the boundary (GitHub Code Scanning, IDE plugins, third-party dashboards), not as an internal data model. Internally we keep the thin `Diagnostic`; when interop is wanted, a single `Diagnostic[] → SARIF 2.1.0` adapter is added at the edge. This RFC writes that down as a future phase and ships no SARIF code.

## Architectural fit

- **Site OS operator model.** The kernel already owns the result envelope (`KernelCommandResult`) and the failure renderer (RFC-0086). The canonical `Diagnostic` belongs in the same package so the contract and its consumer live together; checks depend on the kernel, never the reverse.
- **RFC-0074 audit contracts.** The audit/QA subsystem already produces `auditFindingSchema`, which is essentially a SARIF `result` minus the envelope. We formalize that as the canonical model rather than inventing a parallel one — the audit pipeline migrates by rename, not rewrite.
- **RFC-0030 / KEL.** This is the inner-shape analogue of the envelope lint. Same governance pattern (a lint that scans the checks source and fails the pipeline on regression), one layer deeper.
- **RFC-0086.** Builds on the existing renderer instead of replacing it; the precedence sniffer becomes a migration aid that collapses toward a single `diagnostics` field.
- **DNA-style registries.** The rule-id registry follows the existing pattern of a generated/guarded registry (`uni.registry`, dna registry): a flat source of truth plus a validator, not a process.
- **Scaling Playbook.** The model is uniform across growth stages — a single-page pilot site and a thousand-site fleet both emit the same `Diagnostic`, and the same renderer serves a local terminal and a future CI Code Scanning surface.

## Design

### CLI surface

```sh
# New governance lint — inner-shape analogue of kernel.result.envelope.lint.
pnpm exec site-kernel run diagnostic.shape.lint
pnpm exec site-kernel run diagnostic.shape.lint --json
```

`diagnostic.shape.lint` is `scope: workspace`. It scans `packages/os/site-kernel-checks/src/**/*.ts` and reports:

- **DSL-01** (warning during migration → error after grace): a check produces findings through the bare-string shim (`resultFromViolations(cmd, [...])` / `failResult`) instead of emitting `Diagnostic[]` with registered rule ids.
- **DSL-02** (error): an emitted `ruleId` literal is not present in the rule registry.
- **DSL-03** (error): a `Diagnostic` literal is missing a required field (`ruleId` / `severity` / `message`).

Inline suppression mirrors KEL: a `// diagnostic-shape-ok` comment exempts an intentional exception (audited, not mass-applied).

### TypeScript contracts

The canonical contract lives in `@gogol/site-kernel` as a plain interface (no zod dependency forced into the kernel):

```ts
// packages/os/site-kernel/src/types.ts
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  /** Stable id from the rule registry, e.g. "KEL-01", "BIOME-TOKEN-02". */
  ruleId: string;
  severity: DiagnosticSeverity;
  /** One human-readable sentence. No trailing newline. */
  message: string;
  /** Workspace-relative POSIX path. Optional: some violations are global. */
  file?: string;
  line?: number;
  column?: number;
  /** Imperative remediation a human or agent can execute. */
  fixHint?: string;
  /** Structured supporting evidence (reuses the audit evidence record). */
  evidence?: DiagnosticEvidence[];
  /** Rule-specific structured extras for machine consumers. */
  data?: Record<string, unknown>;
}

/** Canonical per-command result payload carried inside KernelCommandResult.data. */
export interface CheckResult {
  command: string;
  status: "pass" | "warn" | "fail";
  diagnostics: Diagnostic[];
  summary: { error: number; warning: number; info: number };
}
```

`packages/os/site-kernel-checks/src/audit/types.ts` keeps the runtime validator and makes the promotion explicit:

```ts
// auditFindingSchema is re-expressed as the zod realization of Diagnostic.
// severity vocabulary standardized: "warn" -> "warning".
export const diagnosticSeveritySchema = z.enum(["error", "warning", "info"]);

export const diagnosticSchema = z
  .object({
    ruleId: z.string(),
    severity: diagnosticSeveritySchema,
    message: z.string(),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    fixHint: z.string().optional(),
    evidence: z.array(auditEvidenceSchema).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .strict() satisfies z.ZodType<Diagnostic>;

// Back-compat alias so existing imports keep working during migration.
export const auditFindingSchema = diagnosticSchema;
```

Result builders in `result-helpers.ts` gain a structured path while the string path becomes the documented compatibility shim:

```ts
export function diagnosticsResult(command: string, diagnostics: Diagnostic[]): KernelCommandResult<CheckResult>;

// Compatibility shim — unchanged signature. Each string becomes
// { ruleId: command, severity: "error", message } so unmigrated checks
// stay green and still render through the canonical printer.
export function resultFromViolations(command: string, violations: string[]): KernelCommandResult;
```

### Agent-legible console output

This is the third pillar: the console must be easy for an AI agent to _read and fix_, not only for a human to skim. The renderer (`formatFailureDiagnostics`, RFC-0086) is extended to emit, per diagnostic, a fixed-shape block:

```
[ERROR] KEL-01 packages/os/site-kernel-checks/src/registry.ts:472:5
        Registry entry drifted from the manifest on disk.
        fix: run `site-kernel run uni.registry.build` to regenerate uni.registry.json.
```

Properties chosen specifically for agent actionability:

- **Severity token first** (`[ERROR]` / `[WARNING]` / `[INFO]`) — trivially greppable and matches the existing logger prefix.
- **`ruleId` second** — stable, enumerable, linkable to a rule description; lets an agent recognize a class of failure across runs.
- **`file:line:column` locator** in the canonical editor form — clickable, natively parsed by tools, and the same `file:line:col` convention cited for mature analyzers (Cppcheck/clang-tidy). Omitted cleanly when the diagnostic has no location.
- **A `fix:` line** rendered from `fixHint` — the decisive addition over RFC-0086, which currently discards `suggestion`/`fixHint`. This carries the remediation the producing check already knows directly to the agent.
- **Deterministic ordering** — diagnostics are sorted by severity (error → warning → info), then `file`, then `line`, then `ruleId`, so output is stable run-to-run and diff-friendly.
- **A machine-summary footer**, even in pretty mode, e.g. `✖ 3 errors, 1 warning across 2 files · run with --json for the structured payload.`

The 50-line cap and the `… and N more (run with --json for the full list)` truncation footer from RFC-0086 are retained. `--json` continues to emit only the structured `CheckResult` (no pretty text), so machine consumers get the full, untruncated `Diagnostic[]`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Add `Diagnostic`, `DiagnosticSeverity`, `CheckResult` interfaces next to `KernelCommandResult`. |
| `packages/os/site-kernel/src/runtime.ts` | Extend `formatFailureDiagnostics` to render the canonical block (locator + `fix:` line + deterministic sort + machine footer). |
| `packages/os/site-kernel/src/tests/diagnostics-printer.test.ts` | Update/extend to pin the new locator, `fix:` line, and ordering. |
| `packages/os/site-kernel-checks/src/audit/types.ts` | Re-express `auditFindingSchema` as `diagnosticSchema`; standardize severity to `error/warning/info`. |
| `packages/os/site-kernel-checks/src/result-helpers.ts` | Add `diagnosticsResult`; document `resultFromViolations` as the compatibility shim. |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Proposed rule-id registry (flat const map + lookup). |
| `packages/os/site-kernel-checks/src/diagnostic-shape-lint.ts` | Proposed `diagnostic.shape.lint` implementation. |
| `packages/os/site-kernel-checks/src/kernel-result-envelope-lint.ts` | Unchanged; remains the outer-envelope guard (RFC-0030). |

### Output format

`--json` returns the canonical `CheckResult` inside `KernelCommandResult.data`:

```json
{
  "command": "uni.registry.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "REGISTRY-CHANGED",
      "severity": "error",
      "message": "Registry entry drifted from the manifest on disk.",
      "file": "apps/nicaragua-projekt/src/sections/hero/hero.manifest.yaml",
      "line": 12,
      "fixHint": "Run `site-kernel run uni.registry.build` to regenerate uni.registry.json.",
      "data": { "kind": "CHANGED", "expectedVersion": "1.2.0", "diskVersion": "1.3.0" }
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

The shape is stable: machine consumers read `diagnostics[]`; the deprecated `violations`/`findings`/`details` arrays are still accepted by the renderer during migration but are no longer the canonical surface.

### Failure modes

- A command's `exitCode` is `1` when `summary.error > 0`, else `0`. Warnings and info do not fail the pipeline by default (consistent with RFC-0201's warning posture).
- `diagnostic.shape.lint`: DSL-02 and DSL-03 are errors; DSL-01 is a warning during the migration grace period and is promoted to an error once the bare-string population is drained (see Rollout).
- In `--json` mode the renderer prints nothing; only the structured envelope is emitted.
- A `Diagnostic` with no `file` renders without a locator and is sorted after located diagnostics of the same severity.

## Rollout

A durable, phased path — no flag day, shim keeps every phase green:

1. **Phase 0 — model.** Land `Diagnostic` / `CheckResult` in the kernel, re-express `auditFindingSchema` as `diagnosticSchema`, standardize the severity vocabulary, and scaffold the rule-id registry. The `resultFromViolations` shim keeps all ~97 checks green unchanged. Document the deferred SARIF adapter interface (no code).
2. **Phase 1 — renderer.** Extend `formatFailureDiagnostics` to the canonical block (locator, `fix:` line, deterministic sort, machine footer). Legacy shapes still render. This immediately improves `build.check` output for agents before any check is migrated.
3. **Phase 2 — lint in warning mode.** Register `diagnostic.shape.lint`; add it to the packages check pipeline as warnings. Migrate high-traffic / already-structured checks first (`registry`, `biome-tokens`, KEL itself), registering their ids and adding `fixHint`s. Grow the registry incrementally as checks migrate.
4. **Phase 3 — enforce.** Once the bare-string population is drained, flip DSL-01 to error and wire the lint into `build.check`. New apps comply from day one because the pipeline rejects the legacy shape. De-duplicate any overlap with KEL.
5. **Future (out of scope here) — SARIF boundary.** Add `diagnostic.sarif.export` (`Diagnostic[] → SARIF 2.1.0`) and optional GitHub Code Scanning upload as a single edge adapter. The internal model does not change. Tracked as a follow-up RFC.

### Implementation note (2026-06-18, Phase 3 realized)

The full migration was completed by **upgrading the canonical builders themselves** rather than rewriting ~166 call sites. `passResult` / `failResult` / `resultFromViolations` in `result-helpers.ts` now emit the canonical `CheckResult` (each violation string → an error `Diagnostic` keyed to `ruleId = command`). Every string-violation check is therefore migrated structurally, with zero per-call-site churn and identical exit codes. The only reader of the legacy `data.violations` field was the central printer (which already prefers `diagnostics`).

Consequently the bare-string shim no longer exists, so **DSL-01's shim-detection is retired** and repurposed as the lint's operational read-failure guard; **DSL-02/DSL-03 (error)** carry shape enforcement for checks that hand-author `ruleId` literals (the rich `diagnosticsResult` path: registry, biome-tokens, KEL). The deeper per-violation `ruleId`/`fixHint` granularity for coarse single-rule checks remains an optional, incremental follow-up — `ruleId = command` is their stable id today. Structured bespoke-result checks (e.g. `feature.policy.validate`) keep their own result shapes and are outside the bare-string scope of this RFC.

## Alternatives considered

- **Adopt SARIF as the internal model.** Rejected. SARIF is an interchange format; its nested `runs[].results[].locations[].physicalLocation.region`, `tool.driver.rules[]`, and `artifacts[]` shape is a heavy, hand-unfriendly target for ~97 producers and a regression against `resultFromViolations(cmd, [...])`. Mature analyzers (PVS-Studio, clang-tidy) keep a native model and treat SARIF as one output backend — we do the same, at the boundary.
- **Big-bang rewrite of all checks.** Rejected — high risk and churn for no incremental value; the shim + phased lint achieves the same end state safely.
- **A new finding superschema separate from `auditFindingSchema`.** Rejected by decision: the audit finding is already 90% of the target; we promote it rather than fork it.
- **Status quo (string violations).** Rejected — no stable ids, no agent-actionable structure, and the renderer is condemned to sniff four shapes forever.

## Risks

- **Migration drag** across ~97 files. Mitigated by the compatibility shim (nothing breaks) and a warning-first lint that converts the backlog incrementally.
- **Severity vocabulary change** (`warn` → `warning`) touches audit code and any consumer switching on severity. Mitigated by a mechanical rename and a kept alias during Phase 0.
- **Over-structuring.** Some violations are genuinely global/fileless; `Diagnostic.file` is optional and message-only diagnostics remain valid — the model must not force a bogus locator.
- **Registry bureaucracy.** The rule-id registry could become a bottleneck. Mitigated by keeping it a flat const map with a validator, not a review process.
- **Agent gaming.** Agents might "fix" the lint by mass-applying `// diagnostic-shape-ok` or by writing empty `fixHint`s. Acceptance criteria require genuine migration; the renderer treats an empty `fixHint` as absent, and suppressions are audited.

## Acceptance criteria

- [x] `Diagnostic`, `DiagnosticSeverity`, and `CheckResult` are defined in `packages/os/site-kernel/src/types.ts`. (evidence: packages/ directory, package exists)
- [x] `auditFindingSchema` is re-expressed as `diagnosticSchema` with severity `error | warning | info` and `satisfies z.ZodType<Diagnostic>`, without breaking `audit.*` / `app.qa.validate` consumers. (evidence: implemented historically)
- [x] `resultFromViolations(command, string[])` is preserved and documented as the compatibility shim; the existing checks remain green with no changes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `formatFailureDiagnostics` renders the canonical block: `[SEVERITY] ruleId     file:line:column`, the message, and a `fix:` line from `fixHint`, with deterministic ordering, the 50-line cap, and the machine-summary footer; the printer test pins the new behavior. (evidence: implemented historically)
- [x] A rule-id registry exists and `diagnostic.shape.lint` is registered (`scope: workspace`) reporting DSL-01 / DSL-02 / DSL-03. (evidence: implemented historically)
- [x] `--json` output matches the documented `CheckResult` shape and is stable. (evidence: implemented historically)
- [x] At least three pilot checks emit registered rule ids and `fixHint`s (`registry`, `biome-tokens`, `kernel-result-envelope-lint`). (evidence: implemented historically)
- [x] SARIF export is documented as a deferred future phase and **no** SARIF code lands in this RFC. (evidence: implemented historically)
- [x] `AGENTS.md` documents that checks emit `Diagnostic[]` with registered rule ids and `fixHint`s, and that agents repair by structure, not string concatenation. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate RFC-0203 --json` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC, and MUST reference `RFC-0203` in commit messages or PR descriptions when implementing.
- When this RFC is accepted, the implementing agent MUST formalize the amendment relationship by adding `RFC-0203` to the `amendedBy` of RFC-0030, RFC-0074, and RFC-0086, and setting this RFC's `amends` accordingly (deferred to keep the draft a single clean file).
- Agents MUST promote the existing `auditFindingSchema` into the canonical `Diagnostic`; they MUST NOT introduce a separate parallel finding schema.
- Agents MUST NOT adopt SARIF as the internal model. SARIF belongs only in a future, explicitly-scoped boundary adapter.
- Agents MUST NOT delete the `resultFromViolations` string shim during migration; it is the safety net that keeps unmigrated checks green.
- Agents MUST write `fixHint` as an imperative remediation that another agent could execute (a command to run, a file/field to change), not a restatement of the problem.
- Agents MUST NOT mass-apply `// diagnostic-shape-ok` suppressions to silence `diagnostic.shape.lint`; each suppression must be an audited, intentional exception.
- Agents MUST NOT weaken or remove the diagnostics contract established here without a new RFC that supersedes it.
