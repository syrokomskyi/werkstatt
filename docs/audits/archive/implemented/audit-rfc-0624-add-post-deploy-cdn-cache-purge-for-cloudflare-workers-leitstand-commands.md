---
rfcId: RFC-0624
auditId: AUDIT-RFC-0624-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0624

## Verdict: Needs revision

RFC-0624 addresses a real, verified problem (stale CDN cache after `wrangler deploy` causing false-unhealthy health checks and delayed content visibility). The core design — URL-level purge at the command level between deploy and health check — is sound and well-justified. However, the RFC has a significant blind spot around the two-phase health check flow in `leitstand.promote`, an incomplete type signature, and missing AGENTS.md / Compass sync documentation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0624` reports zero violations.

## Axis A — Structural completeness

- **A-1: Incomplete type signature.** The `deployWithPurgeAndHealth` function in the TypeScript contracts section uses `...` as its parameter list (line 165). This is a placeholder, not a minimal type signature. The RFC should either show the real parameters or drop this function — `collectPurgeUrls` and `purgeCacheByUrls` are sufficient to convey the contract.

## Axis B — DNA alignment

- **B-1: DNA-49 update unclear.** The RFC's Architectural fit section states it "completes the propagation contract by ensuring the CDN serves fresh content after deploy, enabling accurate health verification." DNA-49 describes health checks that "bind the live site to the behavior snapshot" but does not mention CDN cache purge. The RFC should state whether DNA-49 needs a new sentence about the purge step, or whether the purge is considered an implementation detail that doesn't require a DNA update. If DNA-49 should be updated, the RFC should include the proposed text.

## Axis C — Ecosystem fit

- **C-1: Missing AGENTS.md update.** The RFC does not mention updating `packages/os/site-kernel-handoff/AGENTS.md` (Leitstand section). That section is detailed and documents every step of the propagate/promote flow. A new bullet describing the purge step (placement, non-blocking behavior, `CLOUDFLARE_ZONE_ID` requirement) should be added. The RFC's file system responsibilities table only lists source files and `.env.example` — it should include the AGENTS.md update.

- **C-2: Compass sync not addressed.** The RFC introduces a new environment variable (`CLOUDFLARE_ZONE_ID`) that becomes part of the deployment configuration surface. The root AGENTS.md Compass document duties require identifying which `docs/*.xml` files need synchronization when repository-wide requirements change. The RFC should state whether `docs/technology.xml` or `docs/requirements.xml` need a new entry for `CLOUDFLARE_ZONE_ID`, or explicitly state that no Compass sync is needed and why.

## Axis D — Forward-only compliance

No issues. The purge is always on when `CLOUDFLARE_ZONE_ID` is present — no opt-in flag, no grace period, no compatibility shim. Missing zone ID gracefully skips purge with a warning, which is incremental adoption, not a dual-path.

## Axis E — Agent-facing policy

No issues. The RFC is `draft` with no self-authorizing language. Implementation notes are explicit behavioral rules. Secret management reuses the existing secretsFile mechanism — no new registry fields or env var patterns.

## Axis F — Pragmatism

- **F-1: `deployWithPurgeAndHealth` abstraction is questionable.** The RFC proposes this as a shared orchestration function between `runLeitstandPropagate` and `runLeitstandPromote`, but the two handlers have fundamentally different deploy flows: propagate is a single deploy→health sequence, while promote has build-identity verification + alt health check BEFORE the main deploy, then main deploy → main health check. The shared function would need to abstract over both shapes, which is not obviously simpler than inlining the purge step in each handler. Combined with the `...` parameter placeholder (A-1), this function adds ambiguity without demonstrated value. The RFC should either show the full signature and explain how it abstracts both flows, or drop it and specify the purge as inline steps in each handler.

## Axis G — Blind spots

- **G-1: Batching not reflected in TypeScript contracts.** The Risks section (line 237) and Implementation notes (line 261) mention URL batching (max 30 URLs per API call), but `purgeCacheByUrls` in the TypeScript contracts (line 158-160) has no batching parameter. The RFC should clarify whether batching is internal to `purgeCacheByUrls` (transparent to the caller) or whether the caller is responsible for chunking. The acceptance criteria correctly require batching, but the contract should reflect it.

- **G-2: Promote's two-phase health check not addressed.** `leitstand.promote` has TWO health checks: (1) alt health check BEFORE main deploy (line 595-608 in `leitstand-commands.ts`), and (2) main health check AFTER main deploy (line 655-662). The RFC says purge runs "after `adapter.propagate` succeeds and before running health checks" — but in promote, `adapter.propagate` is the main deploy (step 4), and the alt health check (step 3) runs BEFORE the main deploy. The RFC must clarify that the purge runs only before the MAIN health check (step 5), not the alt health check (step 3). The alt health check verifies an already-running deployment that was purged during the prior `leitstand.propagate` call. The acceptance criterion "runLeitstandPromote calls purge after adapter deploy succeeds, before health check" is ambiguous — which health check?

- **G-3: `leitstand.rollback` not addressed.** `leitstand.rollback` also deploys code via `adapter.rollback` (line 883-891) and updates `lastPropagated`, but does NOT run health checks. After rollback, visitors would see stale cached content from the rolled-forward release until natural cache expiry. The RFC does not mention rollback in `commands.changed`, `nonGoals`, or the Design section. The RFC should either include rollback in the purge flow (purge after `adapter.rollback` succeeds) or explicitly list it as a non-goal with justification (e.g., "rollback is an emergency operation where delayed cache expiry is acceptable").

## Questions for the author

1. In `leitstand.promote`, should the purge run only before the main health check (after main deploy), or should alt URLs also be purged before the alt health check? The alt deployment was already purged during `leitstand.propagate` — is a second alt purge needed?
2. Should `leitstand.rollback` also purge CDN cache after `adapter.rollback` succeeds? If not, why is delayed cache expiry acceptable for rollback but not for propagate/promote?
3. Does DNA-49 need to be updated to mention the CDN cache purge step, or is it an implementation detail of the existing "health verification" contract?
