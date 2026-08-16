---
rfcId: RFC-0865
auditId: AUDIT-RFC-0865-01
date: 2026-08-15
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0865

## Verdict: Needs revision

RFC correctly identifies the architectural gap (CERT-007 authority disconnected from Leitstand commands) and proposes a sound 5-step rollout. However, the TypeScript contracts for `R2StorageAdapter` and `AstroCertificationProfile` do not match the existing interfaces they claim to implement, and the RFC misses required updates to DNA-49/DNA-73 text, Compass XML, and `packages/werkstatt/AGENTS.md`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0865 --json` returned zero violations.

## Axis A — Structural completeness

- **R2 adapter interface mismatch.** The RFC proposes `R2StorageAdapter` with `putObject(key: string, data: Uint8Array)` (key-addressed). The existing `CertificationStorageAdapterV1` at `packages/werkstatt/src/certification/storage/adapter.ts:21-27` is content-addressed: `putObject(input: StoragePutInputV1)` where `StoragePutInputV1` has `digest: Sha256Digest`, `bytes: Uint8Array`, `mediaType: string`. The RFC must implement the existing interface, not invent a new one.
- **Profile schema mismatch.** The RFC's `AstroCertificationProfile` contract shows `profileId` at top level. The actual `CertificationProfileV1` schema at `packages/werkstatt/src/certification/profile/schemas.ts:223-240` has `id` (top-level), `plugin.id`, `plugin.profileId`, `dimensions`, `producers`, `requirements`, `evaluatorPolicy`, `retentionPolicy`. The RFC's contract must match the real schema.
- **Acceptance criteria evidence references are vague.** Several criteria say "unit test + integration test" without specifying file paths. V-27 requires `(evidence: <file:line>)` annotations for implemented RFCs.

## Axis B — DNA alignment

- **DNA-49 text update missing.** `docs/architecture-dna.md:213` says "all site deployment commands are currently blocked with CERT-TRANSITION-01 until CERT-007 reconnects them." This RFC is that reconnection. The RFC's acceptance criteria and rollout do not list updating DNA-49 text to remove "currently blocked" language. The `satisfies: [DNA-49]` claim is correct but incomplete — the RFC must also update the invariant text.
- **DNA-73 text update missing.** `docs/architecture-dna.md:301` similarly says "All site deployment commands are currently blocked with CERT-TRANSITION-01 until CERT-007." Same issue — the RFC must update this text.

## Axis C — Ecosystem fit

- **Compass XML sync missing.** The RFC does not identify which `docs/*.xml` files need synchronization. `docs/verification-plan.xml` and `docs/development-plan.xml` likely reference the CERT-TRANSITION-01 block or deployment command status. Root AGENTS.md Compass document duties require synchronization.
- **`packages/werkstatt/AGENTS.md` update missing.** The AGENTS.md for the werkstatt package says (CERT-003 section): "No R2 adapter, producer orchestration, deployment commands, or I/O imports exist in this module." After this RFC, an R2 adapter will exist in `packages/werkstatt/src/certification/storage/`. The RFC only mentions root AGENTS.md in acceptance criteria — it must also list `packages/werkstatt/AGENTS.md`.

## Axis D — Forward-only compliance

- **Legacy state references in existing code not explicitly called out.** `leitstand-commands.ts:951-958` has `PIPELINE_STATE_ORDER` with legacy states (`dev-deployed`, `alt-deployed`, `main-deployed`, `promoted`). Functions `detectChannelFromState` (line 870), `autoStepReleaseState` (line 878), `determineNextStep` (line 965) all reference legacy state labels. The RFC says to rewrite `leitstand.pipeline.check` and `leitstand.rollback` but doesn't explicitly call out removing these legacy state references. The nonGoals say "Do not restore legacy release state labels" but the implementation notes should be explicit: these functions and `PIPELINE_STATE_ORDER` must be deleted, not retained.

## Axis E — Agent-facing policy

- No self-authorizing language found. The RFC correctly gates implementation on `status: accepted`.
- Correct references to RFC-0224 (evidence) and RFC-0334 (supersede escalation).
- No unresolved `NEEDS CLARIFICATION` markers.
- Minor: line 315 has a leading space typo ` Leitstand.propagate`.

## Axis F — Pragmatism

- **R2 adapter reinvents existing interface.** The existing `CertificationStorageAdapterV1` is provider-neutral and already has an in-memory implementation. The R2 adapter should be a third implementation of this interface, not a new `R2StorageAdapter` type. The RFC's proposed interface drops content-addressing (digest-based keys) in favor of arbitrary string keys — this is a design regression.
- **Profile contract doesn't match schema.** The `AstroCertificationProfile` pseudocode doesn't match `CertificationProfileV1`. The RFC should reference the actual schema and show a valid instance, not a simplified pseudocode that diverges from the real type.
- **Deploy logic source unclear.** The RFC says "2123 lines of deploy logic" were deleted and "MUST NOT copy old Leitstand code from git history." But `packages/werkstatt-site/src/deploy/` contains only `client-export.ts` (16KB), `infrastructure-generate.ts` (3.5KB), and `index.ts`. The RFC references this path as "existing, called from restored Leitstand logic" but doesn't verify these files contain the needed wrangler deploy, cache purge, or health check logic. If the deploy infrastructure needs to be written, the RFC should say so.

## Axis G — Blind spots

- **R2 credential documentation missing.** The RFC mentions `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` env vars but doesn't specify where they're documented (`.env.example` files) or how unit tests run without real R2 credentials. The existing `.env.example` files across the workspace don't have these vars.
- **Gate decision production flow not traced.** `authorizeDeployment()` requires a `gateDecision: GateDecisionV1` input. The RFC doesn't explain how this decision is obtained at runtime — the orchestrator (`evaluateCertificationDecision()` in `packages/werkstatt/src/certification/aggregation.ts`) needs to run producers, collect evidence, and evaluate. The RFC should trace the flow from command invocation through orchestrator to `authorizeDeployment()`.
- **`leitstand.pipeline.check` legacy state array.** Step 4 says the command reads from `DeploymentOperationState` event chain, but the existing `PIPELINE_STATE_ORDER` array and `determineNextStep` function (which reference legacy states) must be explicitly removed. The RFC should call this out.

## Questions for the author

1. Why does the R2 adapter interface use `putObject(key: string, data: Uint8Array)` instead of implementing the existing content-addressed `CertificationStorageAdapterV1` with `putObject(input: StoragePutInputV1)`? Is there a reason to abandon content-addressing?
2. Where does the deploy logic (wrangler deploy, cache purge, health check, smoke test invocation) come from? Does `packages/werkstatt-site/src/deploy/` already contain it, or does this RFC need to write it?
3. How is the `GateDecisionV1` produced at runtime? The RFC should trace the flow: command → orchestrator → producers → evidence → `evaluateCertificationDecision()` → `authorizeDeployment()`.
