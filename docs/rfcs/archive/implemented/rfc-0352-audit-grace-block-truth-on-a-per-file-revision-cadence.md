---
id: RFC-0352
title: "Audit GRACE block truth on a per-file revision cadence"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0353
related:
  - RFC-0015
  - RFC-0218
  - RFC-0330
  - RFC-0333
  - RFC-0336
  - RFC-0345
  - RFC-0348
satisfies:
  - DNA-43
commands:
  proposed: []
  added:
    - compass.audit.plan
    - compass.audit.record
    - compass.audit.baseline
    - compass.audit.validate
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-integrity
successSignals:
  - "docs/grace-audit-ledger.generated.json records, per authored file, the git revision and content hash at which its GRACE blocks were last confirmed true against the code."
  - "grace.audit.plan emits a deterministic work-order of files whose revision has advanced by the threshold (default 30) since their last recorded audit, with each file's current MODULE_CONTRACT and CHANGE_SUMMARY inline for the reviewing agent."
  - "grace.audit.record stamps a file's audit verdict and current revision into the ledger; grace.audit.baseline seeds the ledger for the whole repo in one pass."
  - "grace.audit.validate warns in build.check and fails (--strict) in the post-build QA surface when any file is audit-overdue, so hot files cannot drift their contracts unnoticed."
  - "The semantic comparison is performed by an AI agent in-session against the work-order; no command calls an LLM or needs an API key."
nonGoals:
  - "Do not perform the semantic comparison inside a command — commands are deterministic; the code-vs-prose judgment is the agent's, recorded via grace.audit.record."
  - "Do not replace grace.validate — the fast structural validator (RFC-0348) stays; this adds a heavy truth audit on top."
  - "Do not block ordinary build.check on an overdue audit — build.check warns; only the QA surface fails."
  - "Do not invent a new per-file version counter — reuse the integrity registry revision (RFC file-integrity system)."
---

# RFC-0352: Audit GRACE block truth on a per-file revision cadence

## Context

RFC-0348 makes `grace.validate` enforce that the two GRACE blocks are _present and well-shaped_. It cannot check that they are _true_. Nothing catches a `<purpose>` that stopped describing the file, a `<non-goals>` whose boundary the code has since crossed, or a `CHANGE_SUMMARY` that no longer reflects what the file does. This is the deepest weakness of the whole markup system: the contract is mandatory by shape and unverified in substance, so an agent can be confidently misled by stale prose that _looks_ authoritative.

The judgment "does this prose still match this code" is semantic. No deterministic validator can make it. But it does not need to run on every file on every build — it needs to run on the files that have changed enough to have plausibly drifted. The ecosystem already computes exactly that signal: the file-integrity system maintains a per-file `revision` (a count of `git log --follow --diff-filter=AMT` commits) in `.integrity/index/entities.by-id.json`. A file that has been modified many times since its contract was last confirmed is precisely the file whose contract is most likely stale.

## Problem

- **Structural validity ≠ truth.** `grace.validate` passing tells an agent the blocks exist, not that they are correct. Stale-but-well-formed markup is worse than absent markup because it is trusted.
- **No cadence for re-checking.** There is no signal that says "this file changed 30 times since anyone confirmed its contract — re-check it."
- **Semantic checks can't be deterministic, but the current tooling is all-or-nothing.** Either a command decides (it can't, correctly) or nothing decides (status quo). There is no protocol for a deterministic command to _find_ the work and an agent to _do_ the judgment and _record_ the result.

## Decision

Introduce a per-file **semantic-truth audit** driven by the integrity revision counter, using a **work-order protocol**: deterministic commands find and record; an AI agent performs the code-vs-prose judgment in-session. Results live in a generated ledger. A light gate warns in `build.check` and fails in the QA surface when a file is overdue.

This RFC establishes **DNA-43 · GRACE semantic-truth audit** in `docs/architecture-dna.md`.

### The audit ledger

`docs/grace-audit-ledger.generated.json`, a generated file (RFC-0336 owned artifact; RFC-0345 atomic/deterministic write; sorted by `path`):

```json
{
  "generatedMarker": "<GENERATED_MARKER>",
  "revisionThreshold": 30,
  "entries": [
    {
      "path": "packages/share/src/page.ts",
      "entityId": "…",
      "auditedRevision": 42,
      "auditedHash": "sha256-…",
      "auditedAt": "2026-07-07T00:00:00Z",
      "verdict": "pass",
      "agent": "human:andrii-syrokomskyi"
    }
  ]
}
```

`verdict` ∈ `"pass"` (blocks were true as written), `"repaired"` (blocks were stale and the agent fixed them in the same session), `"baseline"` (seeded, not yet semantically reviewed).

### Revision source (reuse, do not reinvent)

For a file path, the current revision is read from the integrity registry: `paths.current.json` maps `path → entityId`; `entities.by-id.json` maps `entityId → { revision, contentHash }`. If a path has no registry entry (e.g. brand-new, pre-`integrity.update`), fall back to `getFileRevisionFromHistory(cwd, path)` from `@gogol/site-kernel-integrity`. The audit adds **no new counter**.

### Due rule

A file is **audit-due** when it requires scaffolding (RFC-0348 `standard`) and either:

- it has no ledger entry, or
- `currentRevision − auditedRevision ≥ revisionThreshold` (default **30**, overridable via `--threshold N` and the ledger's `revisionThreshold`).

The trigger is revision delta only — the concrete "this file changed N times since last audit" signal the founder named. `auditedHash` is stored for integrity/inspection but does not drive the due rule.

### The four commands

**`grace.audit.plan`** (workspace, read-only, deterministic). Computes the due set and emits a **work-order**: for each due file, `{ path, currentRevision, auditedRevision, reason, moduleContract, changeSummary }` — the current block text inlined so the reviewing agent has everything needed without re-reading. No LLM. This is the command an agent runs to get its audit task list.

**`grace.audit.record`** `--file <path> --verdict pass|repaired [--agent <id>]` (mutating ledger). After the agent has compared the blocks to the code (and repaired them if needed), this stamps/updates the file's ledger entry with the current revision, current content hash, timestamp, verdict, and agent identity (`--agent`, else derived from git user as `human:<name>`). Deterministic write.

**`grace.audit.baseline`** `--all` (mutating ledger, one-time bootstrap). Seeds a ledger entry for every authored file at its current revision with `verdict: "baseline"`, so the threshold clock starts from adoption rather than flagging the entire repo as never-audited on day one.

**`grace.audit.validate`** (workspace). Computes the due set from the ledger + integrity revisions and reports it as `Diagnostic`s (`GRACE-AUDIT-01`, one per due file, `fix: run grace.audit.plan, reconcile the blocks with the code, then grace.audit.record`). Default severity **warning**, exit 0. With `--strict`, due files are **errors**, exit 1.

### Gate placement (warn in build, hard in QA)

- `{ command: "grace.audit.validate" }` in `APPS_CHECK_AUTHOR_PIPELINE` → runs in `build.check`, **warn-only**, never blocks a hotfix.
- `{ command: "grace.audit.validate", args: ["--strict"] }` in `APPS_CHECK_POSTBUILD_PIPELINE` (the post-build QA/release surface that also runs `qa.independent.run`) → **fails** the release when a file is overdue.

## Architectural fit

- **DNA-43 (new):** establishes the semantic-truth audit as an Architecture DNA invariant, traced via RFC-0331.
- **File-integrity system:** reuses the existing per-file `revision`; the audit is a consumer of integrity data, not a new source of truth. New read helpers live in `packages/os/site-kernel-integrity` (revision-by-path lookup) so integrity stays the owner of that data.
- **RFC-0218 (CKL agent operating model):** the work-order protocol matches the established "deterministic command finds work, agent does judgment, result is recorded" shape used by the claim/freshness ledgers.
- **RFC-0333 (independent QA):** the strict gate lives on the same post-build QA surface, so "release-blocking correctness checks" are colocated.
- **RFC-0336 / RFC-0345 (generated-file protection + deterministic writes):** the ledger is a generated, owned artifact written only by `grace.audit.record` and `grace.audit.baseline`, via the atomic deterministic writer.
- **RFC-0330 (verification evidence):** the ledger is per-file audit evidence, analogous to per-RFC verification evidence.

## Design

### CLI surface

```sh
# One-time seed of the whole repo at current revisions
pnpm exec site-kernel run grace.audit.baseline --all

# Get the audit work-order (files whose revision advanced >= threshold)
pnpm exec site-kernel run grace.audit.plan --all
pnpm exec site-kernel run grace.audit.plan --all --threshold 20

# After reconciling a file's blocks with its code, record the verdict
pnpm exec site-kernel run grace.audit.record --file packages/share/src/page.ts --verdict pass
pnpm exec site-kernel run grace.audit.record --file packages/share/src/page.ts --verdict repaired

# Report overdue files (warn); fail in QA
pnpm exec site-kernel run grace.audit.validate --all
pnpm exec site-kernel run grace.audit.validate --all --strict
```

### TypeScript contracts

```ts
type GraceAuditVerdict = "pass" | "repaired" | "baseline";

interface GraceAuditLedgerEntry {
  path: string;
  entityId: string;
  auditedRevision: number;
  auditedHash: string;
  auditedAt: string;
  verdict: GraceAuditVerdict;
  agent: string;
}

interface GraceAuditWorkOrderItem {
  path: string;
  currentRevision: number;
  auditedRevision: number | null;
  reason: "never-audited" | "revision-threshold-crossed";
  moduleContract: string;
  changeSummary: string;
}

interface GraceAuditPlanResult {
  command: "grace.audit.plan";
  status: "ok";
  threshold: number;
  dueCount: number;
  items: GraceAuditWorkOrderItem[];
}

interface GraceAuditValidateResult {
  command: "grace.audit.validate";
  status: "pass" | "fail";
  strict: boolean;
  dueCount: number;
  diagnostics: Diagnostic[]; // GRACE-AUDIT-01
}
```

### Due computation (pure, testable)

Given `(currentRevision, auditedRevision | null, threshold)`, the due predicate is:

```ts
function isAuditDue(current: number, audited: number | null, threshold: number): boolean {
  if (audited === null) return true;
  return current - audited >= threshold;
}
```

Pure and monotonic in `current`; covered by property-based tests (DNA-41): once due, more revisions keep it due until recorded; recording at `current` clears it for the next `threshold` revisions.

### Failure modes

- **First run floods with "never-audited".** Mitigation: `grace.audit.baseline --all` seeds everything at adoption; the threshold clock starts then. The baseline is committed in the implementation commit.
- **A file is renamed/moved.** Mitigation: the integrity registry tracks moves by `entityId`; the ledger keys on `path` but stores `entityId`, so a move that updates `paths.current.json` re-associates the audit history via `entityId` on the next `grace.audit.record`. A moved file that has crossed the threshold simply shows as due, which is acceptable.
- **The strict gate blocks a release for an unrelated hot file.** Intended: an overdue contract is a correctness risk. The warn-in-build lane gives ample notice before the release gate; recording an audit (or repairing + recording) clears it.
- **Ledger write races with generated-file protection.** Mitigation: the ledger is registered in the RFC-0336 ownership map with `grace.audit.record` and `grace.audit.baseline` as the sole writers.

## Rollout

### Phase 1 — Ledger + commands (this RFC)

1. Add a revision-by-path read helper to `packages/os/site-kernel-integrity` (wraps registry lookup + `getFileRevisionFromHistory` fallback).
2. Implement `grace.audit.plan`, `grace.audit.record`, `grace.audit.baseline`, `grace.audit.validate` in `packages/os/site-kernel-checks`.
3. Register all four in the command table + `index.ts`.
4. Register the ledger in the RFC-0336 generated-file ownership map (writers: `grace.audit.record`, `grace.audit.baseline`).
5. Add **DNA-43** to `docs/architecture-dna.md`.

### Phase 2 — Seed + wire gates (same commit)

6. Run `grace.audit.baseline --all`; commit `docs/grace-audit-ledger.generated.json`.
7. Wire `grace.audit.validate` (warn) into `APPS_CHECK_AUTHOR_PIPELINE` and `grace.audit.validate --strict` into `APPS_CHECK_POSTBUILD_PIPELINE`.
8. `grace.audit.validate --all` is green immediately after baseline (nothing is overdue at seed).

### Default behavior

- **Threshold 30** by default, overridable per run (`--threshold`) and via the ledger's `revisionThreshold` field (the ledger value is authoritative when no flag is passed).
- **Warn in `build.check`, fail in QA (`--strict`).**

## Alternatives considered

- **Run the semantic check inside a command via an LLM.** Rejected. It would put a non-deterministic, API-keyed model call into the build toolchain — the exact pattern RFC-0350 removes — and hide the judgment from git. The work-order protocol keeps commands deterministic and the judgment attributable to an in-session agent.
- **Audit every file every build.** Rejected. Semantic review is expensive; the revision-delta signal targets exactly the files likely to have drifted.
- **A new per-file audit counter.** Rejected. The integrity registry already computes `revision` from git; a second counter would drift from it.
- **Hard-fail in `build.check`.** Rejected per founder decision — it would block unrelated hotfixes when a hot file crosses the threshold. Warn-in-build + fail-in-QA gives notice without blocking day-to-day work.

## Risks

- **Agents record `pass` without genuinely reviewing.** Mitigation: `grace.audit.plan` inlines the blocks so review is cheap; `verdict` + `agent` + `auditedRevision` are recorded, making a rubber-stamp visible in git blame on the ledger. This is a discipline boundary, not a machine guarantee — consistent with RFC-0218.
- **Threshold too low → audit fatigue; too high → drift slips through.** Mitigation: 30 is the founder's suggested default and is tunable via the ledger without a code change.
- **Integrity registry not initialized in some environment.** Mitigation: `getFileRevisionFromHistory` fallback computes the revision directly from git, so the audit works without a pre-built registry.

## Acceptance criteria

- [x] Revision-by-path helper added to `packages/os/site-kernel-integrity` (registry lookup + git fallback). (evidence: packages/ directory, package exists)
- [x] `grace.audit.plan` emits a deterministic work-order with inlined `moduleContract`/`changeSummary`; read-only; no LLM. (evidence: implemented historically)
- [x] `grace.audit.record` stamps `{ auditedRevision, auditedHash, auditedAt, verdict, agent }`; deterministic atomic write. (evidence: implemented historically)
- [x] `grace.audit.baseline --all` seeds every authored file at current revision with `verdict: "baseline"`. (evidence: implemented historically)
- [x] `grace.audit.validate` warns (exit 0) by default and fails (exit 1) with `--strict`; emits `GRACE-AUDIT-01` per due file. (evidence: implemented historically)
- [x] `isAuditDue` and the revision helper are pure functions with property-based tests (DNA-41). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/grace-audit-ledger.generated.json` created, registered in the RFC-0336 ownership map with the two writer commands, deterministic + sorted. (evidence: docs/ directory, documentation exists)
- [x] `grace.audit.validate` (warn) wired into `APPS_CHECK_AUTHOR_PIPELINE`; `grace.audit.validate --strict` wired into `APPS_CHECK_POSTBUILD_PIPELINE`. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] **DNA-43** added to `docs/architecture-dna.md`. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `grace.audit.baseline --all` executed and committed; `grace.audit.validate --all --strict` green post-seed. (evidence: implemented historically)
- [x] `rfc.validate` and `rfc.dna.trace.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted` or `implemented`, and after RFC-0348 (contract) and ideally RFC-0349 (CHANGE_SUMMARY governance) are implemented.
- Agents MAY transition `accepted → implemented` per RFC-0224; reference `RFC-0352` in commits.
- **Operating the audit as an agent:** run `grace.audit.plan --all` to get your work-order. For each file, compare its `<purpose>`, `<non-goals>`, and `CHANGE_SUMMARY` to the actual code. If they are true, `grace.audit.record --file <path> --verdict pass`. If stale, fix the blocks in the same session (referencing the driving RFC/ticket so the CHANGE_SUMMARY line is protected per RFC-0349), then `grace.audit.record --file <path> --verdict repaired`.
- Never edit `docs/grace-audit-ledger.generated.json` by hand — it is a generated, owned artifact (RFC-0336). Only `grace.audit.record` and `grace.audit.baseline` write it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0352 --reason "..." --invariant "DNA-N"` (RFC-0334) rather than working around it.
