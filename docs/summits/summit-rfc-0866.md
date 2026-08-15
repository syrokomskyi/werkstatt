---
rfc: RFC-0866
createdAt: 2026-08-15
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 3
---

# Design Summit: RFC-0866

## Architect

### Findings

- **A1 (concern):** The `executeDeployPhases()` function in the new `deploy-execution.ts` file is a 13-phase pipeline shared across 3 channels via a `channel` parameter. While the RFC specifies channel-specific phases (7: dev, 8: alt, 9: main) as conditional branches, the shared phases (1-6, 10-13) create an implicit coupling between channels. A change to phase 4 (cache purge) for dev could inadvertently affect alt/main. Consider whether the shared phases truly have identical semantics across channels, or whether there are subtle differences (e.g., dev may not need CDN purge if it's a `*.workers.dev` URL without CDN).

- **A2 (question):** The RFC proposes `leitstand.certify` writes to `releases/{releaseId}/gate-decision-{gate}.json`. This path is inside the release artifact directory. Does writing to this path conflict with the release artifact store's content-addressed invariant (DNA-52)? The release directory is typically immutable after `release.ready`. Writing a new file there may violate the immutability contract.

### No concerns

- The RFC correctly reuses existing orchestration primitives (`planProducers`, `executeProducers`, `evaluateCertificationDecision`) rather than reimplementing them.
- The separation of `leitstand.certify` from deploy commands is architecturally sound — it allows inspection before authorization.
- Forward-only compliance is clean — no compatibility shims, no dual-paths.

## Security Engineer

### Findings

- **S1 (concern):** The `leitstand.certify` command executes `mission.check` via the `astro-mission-check` producer. `mission.check` runs external URL probes (Axiom) against the dev-deployed site. The RFC does not address what happens if `mission.check` probes a URL that is not the expected deployment — e.g., if the dev URL is spoofed or if DNS is poisoned. The gate decision produced by certify could attest to the wrong deployment. Consider whether `leitstand.certify` should verify that the `--base-url` passed to `mission.check` matches the actual dev deployment URL from the effect record.

## QA Engineer

### Findings

- **Q1 (concern):** The 13-phase pipeline has multiple failure points (build, wrangler, purge, freshness, health, mission.check, Axiom gate, main verification). The RFC specifies failure modes for each phase individually, but does not address **partial failure recovery**. If phase 6 (health check) fails after phase 2 (wrangler deploy) succeeded, the deployment is live but the effect record says `failed`. What is the recovery procedure? Does the operator need to manually rollback? Should the pipeline auto-rollback on health check failure?

- **Q2 (question):** How do we test `leitstand.certify` in unit tests? The command calls `executeProducers` which calls `mission.check` which requires a live deployment. Unit tests would need to mock the producer handler. The RFC should note the test seam: mock the `ProducerExecutionHandlerV1` and verify that `evaluateCertificationDecision` produces the expected `GateDecisionV1` status.

## Product Manager

### Findings

- **P1 (concern):** The RFC restores deployment functionality, which is the stated goal. The scope is correctly bounded to site deploy commands (not service deploy). The `nonGoals` are explicit. However, the rollout section does not address **operator workflow change**. Previously (pre-RFC-0865), operators ran `leitstand.dev-deploy` directly. Now they must run `leitstand.certify` first, then `leitstand.dev-deploy`. This is a workflow change that should be documented in AGENTS.md and communicated to operators.

## Developer Advocate

### Findings

- **D1 (question):** The RFC references many helper functions (`verifyFreshness`, `runPurgeStep`, `runMissionCheckWithResilience`, `earlyCloudflareTokenCheck`, `buildLastPropagatedEntry`, `writeSystemStateSmart`, `appendAndCommitBordbuch`) that exist in the codebase. The implementation notes say "Reuse existing helper functions — do not reimplement them." This is clear. However, the RFC does not provide import paths for these helpers. A new agent implementing this RFC would need to search the codebase to find them. Consider adding a "Key imports" reference table to the file system responsibilities section.

## Consensus findings

- **A1 + Q1 (2 personas):** The 13-phase shared pipeline creates coupling between channels (A1) and lacks partial failure recovery semantics (Q1). Recommendation: Add a "Partial failure recovery" subsection to the Failure modes section specifying: (a) effect record state on each failure phase, (b) whether auto-rollback is attempted, (c) operator manual recovery steps. For A1's coupling concern: document which phases are truly identical across channels and which have channel-specific behavior (e.g., dev may skip CDN purge).

## Recommendation

**Revise the RFC** — 1 consensus finding and 3 unique findings warrant enhancement before implementation. Route through `fo-idea-enhance` to address:

1. A2: Clarify whether `gate-decision-{gate}.json` in `releases/` violates DNA-52 immutability. If yes, use a different path (e.g., `systems-cache/{id}/gate-decisions/`).
2. S1: Add URL verification to certify flow.
3. Q1: Add partial failure recovery subsection.
4. A1+Q1 consensus: Document channel-specific phase differences and recovery procedures.

No findings does not mean no issues — it means no issues were found from these five perspectives.
