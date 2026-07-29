---
rfcId: RFC-0563
auditId: AUDIT-RFC-0563-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0563

## Verdict: Needs revision

The RFC is structurally sound and DNA-aligned, but the core convergence algorithm is unspecified — "converges on the latest signed commit" (line 107) does not define what "latest" means across multiple remotes with potentially divergent tips. Multiple blind spots (concurrent execution, interrupted fetch, dependency on unaccepted RFC-0564, bootstrap path for `werkstatt.gitmesh.json`) collectively undermine the RFC's coherence for implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0563 --json` returned zero violations.

## Axis A — Structural completeness

- **Failure modes lack exit codes.** The failure modes table (lines 205–212) specifies behavior but not exit codes. The audit skill expects "exit codes and warn-vs-fail behavior." For example, "No remotes configured → `gitmesh.sync` fails with `no-remotes` error" should specify exit code 1 vs. a warning exit code.
- **Risks section missing false-positive rate for `gitmesh.verify`.** The risks section (lines 228–234) covers replication lag, verification cost, and trusted remote compromise, but does not estimate the false-positive rate for signature verification (e.g., key rotation causing valid commits to appear invalid).

## Axis B — DNA alignment

No issues. `satisfies: [DNA-1]` is correct — the RFC body (lines 111–116) explains how git-mesh replicates the monorepo without fragmenting it. `related` references (DNA-1, DNA-44, RFC-0478, RFC-0560, RFC-0562, RFC-0564, RFC-0566) are all relevant and non-decorative. No conflicts with existing DNA invariants. The RFC does not establish a new DNA invariant.

## Axis C — Ecosystem fit

- **Missing AGENTS.md update identification.** The RFC adds a new `gitmesh/` directory to `packages/os/site-kernel/src/` but does not identify that `packages/os/site-kernel/AGENTS.md` may need a section documenting the new subsystem (similar to how `src/cache/` and `src/change-impact.ts` are documented there).
- **Missing Compass XML synchronization.** The RFC introduces a new P2P replication subsystem with a new config file (`werkstatt.gitmesh.json`) and new operational commands. `docs/technology.xml` and `docs/development-plan.xml` may need updates to reflect the new subsystem, but the RFC does not identify which Compass documents need synchronization.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code behind flags. Phase 1 (single remote) is a degenerate case of the same command, not a separate code path.

## Axis E — Agent-facing policy

No issues. Status gate is correct — the RFC is `draft` and implementation notes (line 249) state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224, RFC-0334, and RFC-0330 correctly. No content authoring in acceptance criteria. Storage policy is clean — `werkstatt.gitmesh.json` is explicitly required to not contain secrets (line 257).

## Axis F — Pragmatism

No issues. Three commands (sync, status, verify) each earn their existence — action, query, verification are distinct concerns. TypeScript types are minimal with no speculative generality. The RFC uses standard git protocols rather than proposing a custom one. `packagesImpacted` lists only `packages/os/site-kernel`. `nonGoals` are explicit and meaningful (6 items covering Layers 2–5, custom protocol, and conflict resolution).

## Axis G — Blind spots

- **Convergence algorithm unspecified.** Line 107 says `gitmesh.sync` "converges on the latest signed commit" but does not define the convergence algorithm. With multiple remotes that may have different branch tips, what does "latest" mean? Highest commit timestamp? Highest SHA? The branch tip from the most recently fetched remote? This is the core design question and is underspecified. `GitMeshSyncResult.fromRemote` (line 152) implies one remote "wins," but the selection criteria are not defined.
- **`gitmesh.status` remote SHA acquisition unspecified.** `GitMeshStatus.remoteSha` (line 161) requires knowing the latest remote SHA, but the RFC does not specify how this is obtained without a full fetch. Does `gitmesh.status` run `git ls-remote`? Does it rely on the last fetch state? This affects whether `status` is a network operation or a local-only query.
- **Concurrent execution not addressed.** Two `gitmesh.sync` invocations running simultaneously could conflict on `git fetch` and HEAD advancement. The RFC does not address locking or concurrent execution semantics.
- **Interrupted fetch not addressed.** The failure modes table covers "Clone corruption (missing objects)" via `git fsck` (line 212), but does not address interrupted fetch — what happens if `gitmesh.sync` crashes mid-fetch? Are partial fetch results left in the object store?
- **Bootstrap path for `werkstatt.gitmesh.json` in Phase 1.** The config file is "Created by `werkstatt.network.bootstrap` (RFC-0562)" (line 182), but RFC-0562 marks `werkstatt.network.bootstrap` as a proposed command, not implemented. Phase 1 (single remote) needs the config file before the bootstrap command exists. The RFC should specify how the config is created in Phase 1 (manual creation? a simpler init command?).
- **Dependency on unaccepted RFC-0564.** The RFC depends on RFC-0564 (SWIM) for peer discovery (line 114: "It depends on Layer 2 (SWIM, RFC-0564) for peer discovery — `gitmesh.sync` needs to know which peer workshops to fetch from"). RFC-0564 is `draft`. The RFC does not address what happens if RFC-0564 is rejected or significantly changed. Phase 1 works around this (single remote, no peers), but Phase 2 is blocked.
- **Git object safety not addressed.** The RFC verifies commit signatures but does not address the risk of malicious git objects (e.g., crafted packfiles exploiting git vulnerabilities during `git fetch`). The threat model in RFC-0562 mentions "Byzantine workshop serves corrupted platform code" mitigated by commit signatures, but commit signatures do not protect against exploits in the fetch path itself.
- **`werkstatt.identity.json` vs `werkstatt.gitmesh.json` relationship unclear.** `gitmesh.verify` reads the operator's public key from `werkstatt.identity.json` (line 107), while `gitmesh.sync` reads remotes from `werkstatt.gitmesh.json` (line 182). The RFC does not clarify whether these files are independent or whether `werkstatt.gitmesh.json` references `werkstatt.identity.json`. If they are independent, the RFC should state that `gitmesh.verify` requires both files to be present.

## Questions for the author

1. What is the convergence algorithm for `gitmesh.sync` when multiple remotes have different branch tips? How is "latest signed commit" determined — by commit timestamp, by SHA ordering, by remote priority, or by a quorum of remotes reporting the same tip?
2. How does `gitmesh.status` obtain `remoteSha` without a full fetch? Is it a network operation (`git ls-remote`) or a local-only query based on the last fetch state? This determines whether `status` is safe to run frequently.
3. What creates `werkstatt.gitmesh.json` in Phase 1, given that `werkstatt.network.bootstrap` (RFC-0562) is a proposed command that does not yet exist? Is manual creation expected, or does `gitmesh.sync` auto-create a default config with `origin` as the sole remote?
