---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 8739d205...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/src/release/index.ts
  - packages/os/site-kernel-handoff/src/release/release.module.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts
  - packages/os/site-kernel-handoff/src/leitstand/index.ts
  - packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-checks/src/behavior-snapshot.ts
  - packages/ontology/src/operations/mission.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/architecture-dna.md
---

# Code Review: RFC-0724 — release.ready rename, auto-recovery, retry, mandatory Axiom gate, bordbuch auto-commit

### Verdict: Needs revision

Two findings: error messages in `leitstand.propagate` and `leitstand.promote` use `--system` flag but the commands now accept `--site` (RFC-0726 unified `--site` across all leitstand commands). The `--force` bypass for `leitstand.promote` freshness retry is specified in the RFC but not implemented in code.

### Mechanical floor

Pass — `build:check` passes on both `@warpgogol/site-kernel-handoff` and `@warpgogol/site-kernel-checks`. All 699+887 tests pass. `rfc.validate --id RFC-0724` passes with 0 errors.

### Axis A — Structural correctness

No issues. The rename is consistent across all code locations. `verifyFreshness` is properly exported and reused in both `runLeitstandDevDeploy` and `runLeitstandPromote`. The auto-recovery logic in `behavior-snapshot.ts` is clean — regenerates snapshot, writes via `writeFileIfChanged`, returns pass with descriptive summary.

### Axis B — DNA alignment

No issues. DNA-48 (Release discipline) updated: state machine `prepared → ready → alt-deployed → promoted → rolled-back`. DNA-52 (Release artifact store) updated. DNA-56 (Studio Gate) updated to reference `release.ready`. All align with the RFC's forward-only rename.

### Axis C — Ecosystem fit

- **Finding C-1**: Error messages in `leitstand.propagate` (line 1583-1584) and `leitstand.promote` (lines 2024-2025, 2069) use `--system` flag, but these commands were migrated to `--site` by RFC-0726. The error messages should say `--site` to match the actual flag the commands accept. This is a user-facing correctness issue — operators following the error instructions would use `--system` which is no longer accepted.

### Axis D — Forward-only compliance

No issues. Clean break — no backward compat alias for `release.publish` or `published` state. No dual-paths. Legacy code paths deleted, not maintained behind flags.

### Axis E — Agent-facing clarity

No issues. Comments reference RFC-0724 with clear explanations. `verifyFreshness` export is documented. Auto-recovery warning log is descriptive. Bordbuch auto-commit log distinguishes `logger.info` (progress) from `logger.warn` (non-fatal failure).

### Axis F — Pragmatism

- **Finding F-1**: The RFC specifies `--force` as a manual escape hatch for `leitstand.promote` freshness retry (line 144: "`--force` remains as manual escape hatch", line 231: "`--force` bypasses", line 241: "Retry loop in promote: Active by default. `--force` bypasses."). The code at `leitstand-commands.ts:2065-2070` does not check `input.flags["force"]` — the freshness verification always throws on failure with no bypass. This is a spec gap: the RFC promises an escape hatch that doesn't exist in the implementation.

### Axis G — Blind spots

No issues. Auto-recovery performance cost documented in RFC risks section (2x snapshot building). Retry loop latency documented (~45s max). Axiom gate cost documented (~5 min). Edge cases for concurrent `mission.validate` runs addressed via `gitExecWithRetry` backoff.

### Spec compliance

| Requirement from the spec | Status | Evidence |
| --- | --- | --- |
| Auto-recovery for SNAP-01 | Done | `behavior-snapshot.ts:467-490` |
| `release.publish` → `release.ready` rename | Done | `release-commands.ts:622`, `index.ts`, `release.module.ts` |
| `published` → `ready` state | Done | All code locations updated |
| Full protocol error messages | Done | `leitstand-commands.ts:1580-1584`, `2022-2025` |
| Mandatory Axiom gate in release path | Done | `leitstand-commands.ts:741-815` |
| `verifyFreshness` retry in promote | Done | `leitstand-commands.ts:2056-2071` |
| `--force` bypass for promote freshness | Missing | Not implemented — see Finding F-1 |
| Bordbuch auto-commit on all paths | Done | `mission-materialization-commands.ts:214-227` |
| Documentation sync | Done | AGENTS.md, architecture-dna.md updated |
| Error messages use `--site` not `--system` | Partial | See Finding C-1 |

### Questions for the author

1. Should the `--force` flag be added to `leitstand.promote` to bypass freshness verification, or should the RFC be amended to remove the `--force` escape hatch promise?
2. Should error messages in `leitstand.propagate` and `leitstand.promote` be updated to use `--site` instead of `--system` to match RFC-0726's flag unification?
