---
id: RFC-0330
title: "Emit per-RFC verification evidence artifacts"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-06
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0224
  - RFC-0268
amendedBy:
  - RFC-0376
related:
  - RFC-0326
  - RFC-0291
  - RFC-0329
  - DNA-35
commands:
  proposed: []
  added:
    - rfc.verification.emit
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
satisfies:
  - DNA-35
successSignals:
  - "`rfc.verification.emit --id RFC-XXXX` runs the RFC's acceptance probes and writes docs/rfcs/verification/rfc-xxxx.generated.json capturing per-probe results, timings, git commit, kernel version, RFC file hash, and normalized acceptance-probe hash."
  - "Every RFC created on or after 2026-07-07 that declares acceptance probes and reaches status implemented has a committed passing evidence artifact (enforced by rfc.validate rule V-23)."
  - "Answering 'is this RFC's implementation claim backed by a recorded probe run, and at which commit?' takes one file read instead of trusting the implementer's checklist."
nonGoals:
  - "No cryptographic signatures on evidence — git history plus recorded commit hashes suffice for the internal consumer; when an external audit consumer appears, reuse the RFC-0291 signing infrastructure in a follow-up RFC."
  - "No backfill for RFCs created before 2026-07-07 — evidence is forward-only (founder decision, 2026-07-06)."
  - "No automatic emission inside build pipelines — probes may run builds; emission is on-demand, same posture as rfc.acceptance.run (RFC-0268)."
  - "No evidence for RFCs without acceptance probes — this RFC does not make probes mandatory."
  - "No CI-run URLs, screenshots, or external artifact references in v1."
acceptance:
  - probe: command-registered
    name: "rfc.verification.emit"
  - probe: file-exists
    path: "packages/os/site-kernel/src/rfc/verification-evidence.ts"
  - probe: file-exists
    path: "docs/rfcs/verification/rfc-0330.generated.json"
  - probe: run
    command: "site-kernel run rfc.validate"
    expect:
      exitCode: 0
---

# RFC-0330: Emit per-RFC verification evidence artifacts

## Context

RFC-0268 made acceptance criteria machine-checkable: RFCs declare typed `acceptance:` probes, and `rfc.acceptance.run` executes them. RFC-0224 authorized agents to self-transition RFCs `accepted` → `implemented` once criteria are verified. RFC-0326 (draft) is adding `filesModified` to every `KernelExecutionReport`.

What is missing is the **join**: probe _definitions_ live in frontmatter, probe _executions_ vanish into terminal scrollback. When an agent stamps `implemented`, the claim "probes passed" is unrecorded — nobody can later ask _when_ they passed, _at which commit_, or _what exactly ran_. The 2026-07 expert review batch identified this as the core protocol gap ("agent says — I believe" instead of "agent says and records checkable evidence"), and converged on the remedy: evidence must be **derived from execution, never hand-authored**.

At fleet scale (hundreds → thousands of sites built by autonomous agents) this evidence layer becomes the audit trail that answers "why is the system the way it is, and what proves it works" — and eventually a sellable trust artifact through the agent surface (RFC-0286…0292).

## Problem

The unprotected invariant is: **an `implemented` status on a probe-bearing RFC must be backed by a recorded, reproducible probe run.**

Today:

1. `rfc.acceptance.run` prints results and exits; nothing persists.
2. The `accepted → implemented` transition (RFC-0224) requires criteria to be "satisfied and checked" but produces no artifact proving the check happened.
3. There is no place to record the commit hash at which verification succeeded, so evidence cannot be correlated with code state.
4. Re-verification after later refactors has no baseline to compare against.

## Decision

The kernel gains a `rfc.verification.emit` command, and `rfc.validate` gains rule **V-23** enforcing evidence presence for newly created, probe-bearing, implemented RFCs.

1. **New module** `packages/os/site-kernel/src/rfc/verification-evidence.ts` implements `rfc.verification.emit` (workspace scope, `mutatesState: true`). Target selection mirrors `rfc.acceptance.run`: `--id <rfc-id>` or `--status <status>`; at least one required.

2. For each target RFC that declares `acceptance:` probes, the command:
   - executes every probe via the **existing exported** `runProbe` from `packages/os/site-kernel/src/rfc/acceptance.ts` (no duplicate executor), measuring per-probe duration;
   - captures context: ISO timestamp, current git commit (`git rev-parse HEAD` via `child_process`, `"unknown"` on failure), git dirty flag (`git status --porcelain` non-empty), and the `@gogol/site-kernel` package version;
   - writes `docs/rfcs/verification/<rfc-slug-id>.generated.json` (e.g. `rfc-0330.generated.json`) with the envelope below, carrying `generatedMarker: GENERATED_MARKER`. Because the command writes under `docs/`, the write MUST use `writeFileAtomic` and the module MUST be declared on `SHARED_WRITE_ALLOWLIST` (RFC-0258 / RFC-0087). Targets without probes are skipped with an info diagnostic (no empty evidence files).

3. **Amendment to RFC-0224 transition preconditions**: for RFCs with `createdAt >= 2026-07-07` that declare `acceptance:` probes, the `accepted → implemented` transition additionally requires running `rfc.verification.emit --id <id>` with `overall: "pass"` and committing the evidence file together with the transition. This is stated in AGENTS.md and in the template's Implementation-notes boilerplate.

4. **New rule V-23 in `rfc.validate`** (`packages/os/site-kernel/src/rfc/handlers/validate.ts`): for every RFC with `createdAt >= 2026-07-07` (the shared cutoff constant `RFC_METADATA_CUTOFF = "2026-07-07"`, exported from `rfc/types.ts`), non-empty `acceptance:`, and `status: implemented`:
   - **error** when `docs/rfcs/verification/<slug>.generated.json` is missing or unparseable;
   - **error** when the evidence file's `overall` is not `"pass"`;
   - no content-drift or staleness check in v1 (re-verification cadence is a future concern). RFCs created before the cutoff are fully exempt — V-23 never fires for them.

## Architectural fit

- **RFC-0268**: pure consumer — reuses `runProbe` and the probe vocabulary unchanged. `rfc.acceptance.run` keeps its role as the quick, artifact-free check.
- **RFC-0224**: amended, not replaced — the self-transition right stands; it now leaves a trace.
- **RFC-0326**: complementary. Once implemented, `run`-probes spawn kernel commands whose reports carry `filesModified`; the evidence envelope reserves an optional field for it (see contract) but v1 does not populate it (the child-process boundary hides the report; a follow-up may thread it through).
- **RFC-0291 (signing)**: deliberately not used yet — see nonGoals. The envelope is designed so a detached signature can be added later without reshaping it.
- **DNA-35**: untouched. Evidence records probe runs; `app.contract.full` remains the deploy-readiness signal.

## Design

### CLI surface

```sh
pnpm exec site-kernel run rfc.verification.emit --id RFC-0330
pnpm exec site-kernel run rfc.verification.emit --status implemented   # bulk re-emit
pnpm exec site-kernel run rfc.verification.emit --id RFC-0330 --json
```

Flags: `id` (string, optional), `status` (string, optional) — at least one required, same validation message pattern as `rfc.acceptance.run`.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/rfc/verification-evidence.ts

export interface VerificationEvidenceProbeRecord {
  probe: AcceptanceProbe;    // the declared probe, verbatim
  ok: boolean;
  detail: string;            // ProbeResult.detail
  durationMs: number;
}

export interface VerificationEvidence {
  generatedMarker: string;   // GENERATED_MARKER from @gogol/site-kernel
  rfcId: string;             // "RFC-0330"
  title: string;
  rfcStatus: RfcStatus;      // status at emission time
  emittedAt: string;         // ISO 8601
  commit: string;            // git HEAD hash or "unknown"
  workingTreeDirty: boolean;
  kernelVersion: string;     // @gogol/site-kernel package.json version
  rfcFileHash: string;        // SHA-256 hex of the RFC markdown at emission time
  acceptanceHash: string;     // SHA-256 hex of normalized declared probes
  probes: VerificationEvidenceProbeRecord[];
  overall: "pass" | "fail";
  /** Reserved for RFC-0326 follow-up; always absent in v1. */
  filesModified?: string[];
}

export interface RfcVerificationEmitResult {
  command: "rfc.verification.emit";
  status: "pass" | "fail";   // fail when any emitted evidence has overall: fail
  emitted: Array<{ rfcId: string; file: string; overall: "pass" | "fail" }>;
  skipped: Array<{ rfcId: string; reason: "no-probes" }>;
  diagnostics: Diagnostic[];
}

// packages/os/site-kernel/src/rfc/types.ts (ADDITIVE)
export const RFC_METADATA_CUTOFF = "2026-07-07"; // shared by V-23 (this RFC), V-24 (RFC-0331), V-25 (RFC-0335)
```

Evidence filename derivation: lowercase the RFC id (`RFC-0330` → `rfc-0330`) + `.generated.json`. One file per RFC, overwritten on re-emission (git history preserves prior runs — that is the versioning mechanism; do not build one).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/rfc/verification-evidence.ts` | New: emit handler, envelope builder, git-context capture |
| `packages/os/site-kernel/src/rfc/types.ts` | `RFC_METADATA_CUTOFF` constant, result types |
| `packages/os/site-kernel/src/rfc/rfc.module.ts` | Register `rfc.verification.emit` |
| `packages/os/site-kernel/src/rfc/handlers/validate.ts` | New rule V-23 |
| `docs/rfcs/verification/` | New directory of evidence artifacts (committed) |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | `SHARED_WRITE_ALLOWLIST` entry for the docs evidence writer |
| `AGENTS.md` | Transition-precondition paragraph (see Decision 3) |
| `docs/rfcs/rfc-0000-template.md` | Implementation-notes boilerplate mentions evidence emission before stamping `implemented` |
| `packages/os/site-kernel/src/tests/verification-evidence.test.ts` | New: envelope shape, pass/fail aggregation, skip-without-probes, V-23 firing matrix |

The `verification/` subdirectory does not collide with `listRfcFiles` (which lists files, not subdirectories, in `docs/rfcs/`) — verify during implementation, as with RFC-0329's generated files.

### Output format

`docs/rfcs/verification/rfc-0330.generated.json`:

```json
{
  "generatedMarker": "<standard marker>",
  "rfcId": "RFC-0330",
  "title": "Emit per-RFC verification evidence artifacts",
  "rfcStatus": "implemented",
  "emittedAt": "2026-07-06T14:00:00.000Z",
  "commit": "6a5e25ff…",
  "workingTreeDirty": false,
  "kernelVersion": "1.x.x",
  "rfcFileHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "acceptanceHash": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  "probes": [
    { "probe": { "probe": "command-registered", "name": "rfc.verification.emit" }, "ok": true, "detail": "registered", "durationMs": 12 }
  ],
  "overall": "pass"
}
```

Command `--json` output is `RfcVerificationEmitResult`. Pretty mode prints one line per emitted file: `[evidence] RFC-0330 → docs/rfcs/verification/rfc-0330.generated.json (pass, 4 probes)`.

### Failure modes

- Any probe fails → evidence is still written (with `overall: "fail"` — a failing run is also evidence), command exits 1.
- Target RFC has no probes → skipped with info diagnostic, exit unaffected.
- Git unavailable → `commit: "unknown"`, `workingTreeDirty: false`, warning diagnostic; emission proceeds (evidence without commit anchor is degraded, not useless).
- V-23 fires only under the exact conjunction (cutoff AND probes AND implemented AND missing/failing evidence); every other combination is silent.

## Rollout

1. Implement module + command + V-23 + tests. V-23 fires on nothing at introduction time (no post-cutoff implemented RFCs exist yet) — zero flag-day risk.
2. Update AGENTS.md and the template boilerplate.
3. This RFC batch (0329–0335) dogfoods the flow: each declares probes, and each implementer must emit evidence when stamping `implemented`.
4. Regenerate the command manifest.
5. Future (separate RFCs): staleness/re-verification cadence, RFC-0291 signatures, threading `filesModified` through the probe child-process boundary, surfacing evidence through the agent surface.

## Alternatives considered

- **Hand-authored `verification:` frontmatter block** (method/coverage/pipeline, per the original space-program proposal): rejected — agents fill such fields templately; the information becomes noise. Evidence must be derived from execution (unanimous position of the 2026-07 expert critique).
- **Persisting inside `rfc.acceptance.run` instead of a new command**: rejected — acceptance.run is a fast, side-effect-free check used casually; silently writing files on every casual run would surprise callers and churn git. Explicit emission marks intent ("this run is the record").
- **Evidence in frontmatter of the RFC itself**: rejected — mixes generated data into a hand-authored file, breaking the RFC-0081 generated/authored partition.
- **Cryptographic signing now (RFC 9421 / RFC-0291)**: rejected for v1 — no external consumer exists; git history already provides tamper-evidence for the internal one. Envelope is signature-ready.
- **Append-only evidence ledger (one file, many runs)**: rejected — git history of the per-RFC file already provides the run sequence; a ledger duplicates git.

## Risks

- **Evidence rot**: code changes after emission can silently invalidate recorded evidence. Accepted for v1 (recorded commit hash makes the gap visible); re-verification cadence is deferred.
- **Dirty-tree emissions**: evidence emitted from an uncommitted state records a commit that doesn't contain the verified code. Mitigated by recording `workingTreeDirty`, `rfcFileHash`, and `acceptanceHash` — consumers can discount or compare such evidence; V-23 does not reject it in v1.
- **Probe timeout inheritance**: `runProbe`'s 120s timeout applies; a slow build-running probe records a timeout failure. Acceptable — that is accurate evidence.
- **Directory growth**: one small JSON per probe-bearing RFC; negligible.

## Acceptance criteria

- [x] `rfc.verification.emit` registered with `id`/`status` flags; `kernel-flags-lint` passes. (evidence: implemented historically)
- [x] Emitting for an RFC with probes writes the envelope with all fields populated, including `rfcFileHash` and `acceptanceHash`; probe records reuse `runProbe` (verified by test spying/reuse, not reimplementation). (evidence: implemented historically)
- [x] Failing probes produce `overall: "fail"`, the file is still written, exit code 1. (evidence: implemented historically)
- [x] RFCs without probes are skipped with info diagnostics. (evidence: implemented historically)
- [x] Evidence writes use `writeFileAtomic`, and `workspace.write.boundary.lint` passes with the new `SHARED_WRITE_ALLOWLIST` entry. (evidence: implemented historically)
- [x] `RFC_METADATA_CUTOFF` exported from `rfc/types.ts` and used by V-23. (evidence: implemented historically)
- [x] V-23 test matrix: pre-cutoff/implemented/probes/no-evidence → silent; post-cutoff/implemented/probes/no-evidence → error; post-cutoff/implemented/probes/failing-evidence → error; post-cutoff/accepted → silent; post-cutoff/implemented/no-probes → silent. (evidence: implemented historically)
- [x] AGENTS.md and template boilerplate updated. (evidence: AGENTS.md:1, agent guide updated)
- [x] Evidence file for this RFC itself exists and passes once implemented (dogfood). (evidence: implemented historically)
- [x] `command.manifest.generate` regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Reuse `runProbe` from `rfc/acceptance.ts` — do NOT duplicate probe execution logic. If `runProbe` needs a timing wrapper, wrap at the call site.
- Git context capture uses `child_process` with the repository root as cwd; never throw on git failure — degrade to `"unknown"`.
- Compute `rfcFileHash` from the exact markdown bytes read for that RFC and `acceptanceHash` from a stable JSON serialization of the declared probes. Do not hash terminal output.
- Evidence JSON MUST import/use `GENERATED_MARKER`; do not invent a second marker string.
- Any write to `docs/rfcs/verification/*.generated.json` MUST go through `writeFileAtomic`; raw `writeFile`/`writeFileSync` is forbidden for this shared docs output.
- When stamping this RFC `implemented`, run `rfc.verification.emit --id RFC-0330` and commit the evidence file in the same commit (dogfood of the amended RFC-0224 precondition).
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions (as amended here); reference `rfc-0330` in commits.
- Agents MUST NOT weaken V-23 or the transition precondition without a superseding RFC.
