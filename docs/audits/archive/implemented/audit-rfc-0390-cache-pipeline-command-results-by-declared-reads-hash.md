---
rfcId: RFC-0390
auditId: AUDIT-RFC-0390-01
date: 2026-07-17
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0390

## Verdict: Needs revision

The RFC is architecturally sound and addresses a real performance bottleneck, but has several findings on axes C, E, F, and G that should be resolved before implementation. The most serious are: missing Compass sync identification (C), missing AGENTS.md update identification (C), `cacheable` field placement ambiguity (F), and missing concurrent-execution / cache-warming considerations (G).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0390 --json` returns 0 violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present tense ("The kernel pipeline executor gains…"). CLI surface shows exact invocations with flags. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Output format documents `--json` shape. Failure modes specify behavior per scenario. Rollout describes default behavior, adoption path, and new-app compliance. Alternatives considered has six real alternatives with rejection reasons. Risks includes false-positive rate and agent misinterpretation risk. Acceptance criteria are checkable and cover the decision's scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-53]` is correct — the RFC uses `@gogol/fingerprint` for all file hashing (`fingerprintTree`, `fingerprintFile`, `stableJsonHash`), directly enforcing DNA-53's "all project hashes use the shared `@gogol/fingerprint` package" invariant. The RFC body explains how it enforces this (hash computation via `fingerprintTree`/`fingerprintFile`, composite keys via `stableJsonHash`). `related: [DNA-53]` is relevant and not decorative. No conflicts with existing DNA invariants — the RFC extends existing infrastructure (RFC-0266 `reads`, RFC-0382 `CacheLayer`) without contradicting any DNA.

## Axis C — Ecosystem fit

**Finding C-1 (fail): Compass sync not identified.** The RFC changes repository-wide requirements (mandatory `reads`/`cacheable` contract for all commands) and shared package contracts (`KernelCommandDefinition`, `KernelCommandMetadata`). Per root AGENTS.md Compass document duties, the RFC should identify which `docs/*.xml` files need synchronization. At minimum `docs/requirements.xml` (new requirement: command-level caching) and `docs/technology.xml` (new dependency: picomatch, new module: `command-result-cache.ts`) likely need updates. The RFC's file system responsibilities table does not mention any `docs/*.xml` files.

**Finding C-2 (fail): AGENTS.md updates not identified.** The RFC introduces a mandatory contract ("every registered command MUST declare either `reads` or `cacheable: false`"). This is a governance rule that should be reflected in `packages/AGENTS.md` or `packages/os/site-kernel/AGENTS.md` (if one exists) so agents know the requirement when authoring new commands. The RFC does not identify which `AGENTS.md` files need updates.

**Finding C-3 (pass): Pipeline placement is correct.** `command.reads.validate` is workspace-scoped, added to `PACKAGES_CHECK_PIPELINE` — the correct pipeline for workspace-level drift guards. The RFC justifies this as running once per workspace, not per site.

**Finding C-4 (pass): Package boundaries are respected.** All changes flow `packages/* → packages/*`: `@gogol/site-kernel` (cache module, pipeline executor), `@gogol/site-kernel-checks` (command annotations, new validate command), `@gogol/fingerprint` (hashing). No site-to-site or site-to-service imports.

**Finding C-5 (pass): Command lifecycle buckets are internally consistent.** `command.reads.validate` is in `proposed` and will land in `added` upon implementation. `executeKernelPipeline` is in `changed` — it is an existing internal function, not a registered command. This is correct.

## Axis D — Forward-only compliance

No issues. The RFC does not propose a compatibility shim or dual-path. `reads` is turned from declarative into functional directly — no parallel interpretation. Commands without `reads` are not given a grace period; `command.reads.validate` fails for them immediately. Legacy code paths are not maintained behind a flag. The `--force` flag is a user-facing bypass, not a legacy compatibility layer.

## Axis E — Agent-facing policy

**Finding E-1 (fail): Missing RFC-0230 reference.** The RFC introduces `command.reads.validate` — a new workspace-scoped command. Per audit axis E, if the RFC touches agent surface (new commands), implementation notes should reference RFC-0230 (agent surface). The current implementation notes reference RFC-0224, RFC-0334, RFC-0330, but not RFC-0230. The new command should be registered in the command manifest (`command.manifest.generate` per RFC-0266) and the agent surface projection.

**Finding E-2 (pass): Status gate is correct.** The RFC is `status: draft` and implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.

**Finding E-3 (pass): Anti-fabrication is not applicable.** The RFC's acceptance criteria are all code/infrastructure changes an agent can make. No content authoring is required.

**Finding E-4 (pass): Storage policy is not applicable.** The RFC touches SQLite cache (build-time CLI), not client-side persistence. RFC-0382 already established that SQLite cache is local CLI/build-time, not runtime web app persistence.

## Axis F — Pragmatism

**Finding F-1 (fail): `cacheable` field placement is ambiguous.** The RFC defines `cacheable?: boolean` on both `KernelCommandMetadata` (line 156-157) AND on `KernelCommandDefinition` (line 132-138, in the JSDoc comment block). Since `KernelCommandDefinition extends KernelCommandMetadata`, defining `cacheable` on both is redundant. It should be on `KernelCommandMetadata` only (alongside `requiresNetwork`, `timeoutMs`, etc.), and the `KernelCommandDefinition` block should only show the `reads` JSDoc update. The current contract listing shows it in both places, which will confuse implementation.

**Finding F-2 (pass): Minimal command surface.** `command.reads.validate` earns its existence — it enforces a mandatory contract across all registered commands. It cannot be a flag on an existing command because it validates the registry itself.

**Finding F-3 (pass): Existing patterns are reused.** The RFC reuses `CacheLayer` (RFC-0382), `reads` (RFC-0266), `@gogol/fingerprint` (RFC-0364). The alternatives section explains why extension of these was preferred over new infrastructure.

**Finding F-4 (pass): Scope discipline is clean.** `packagesImpacted` lists exactly the three packages touched. `appsImpacted` is empty (no app-specific changes). `nonGoals` are explicit and meaningful (7 items, all concrete).

## Axis G — Blind spots

**Finding G-1 (fail): Concurrent execution not addressed.** Two agents running `build:check` simultaneously on the same site will both read and write to the same SQLite cache. `better-sqlite3` handles concurrent reads, but concurrent writes to the same key could produce race conditions or database lock errors. The RFC should specify behavior: WAL mode, retry-on-lock, or last-writer-wins semantics.

**Finding G-2 (fail): Cache warming strategy not described.** On first run after implementation, all 176 commands will cache-miss and execute normally. But the RFC does not describe whether there is a warm-up path or whether the first run is simply slow (same as today). This is important for operator expectations — the RFC should state that the first run after implementation has the same duration as today, and only subsequent runs benefit from the cache.

**Finding G-3 (pass): Performance cost is specified.** Module hash computation: ~50-100ms once per pipeline run. `fingerprintTree` on ~50-100 files. This is reasonable and documented in the Risks section.

**Finding G-4 (pass): False positives are addressed.** The RFC identifies stale `reads` declarations as a false-positive risk and mitigates with `command.reads.validate` + code review + `cacheable: false` escape hatch.

**Finding G-5 (pass): Edge cases are partially addressed.** Empty states (new app with no content) are handled — globs matching zero files produce a valid hash. Cache unavailable (no better-sqlite3) is handled with graceful degradation. However, see G-1 for concurrent execution edge case.

**Finding G-6 (pass): Migration path is documented.** Existing apps' path to compliance is described in Rollout: one-time bulk annotation of ~170 commands. New apps comply automatically via `command.reads.validate` in `PACKAGES_CHECK_PIPELINE`.

## Questions for the author

1. Which `docs/*.xml` Compass files need synchronization for this RFC? At minimum `docs/requirements.xml` (new mandatory contract) and `docs/technology.xml` (new picomatch dependency, new `command-result-cache.ts` module) should be identified.
2. Which `AGENTS.md` files should document the mandatory `reads`/`cacheable` contract so agents authoring new commands know the requirement?
3. How should concurrent pipeline executions (two agents, two terminals) handle SQLite write contention — WAL mode, retry-on-lock, or last-writer-wins?
4. Should `cacheable` be defined on `KernelCommandMetadata` only (removing the duplicate from `KernelCommandDefinition` in the contract listing)?
5. Should the RFC reference RFC-0230 in implementation notes since it introduces a new command visible on the agent surface?
