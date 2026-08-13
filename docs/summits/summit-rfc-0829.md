---
rfc: RFC-0829
createdAt: 2026-08-13
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 2
---

# Design Summit: RFC-0829

## Architect

### Findings

- **A1 (concern):** Concurrent test runs writing to the same evidence file — if two test runners for the same level execute simultaneously (e.g., CI and a local dev-deploy), the last writer wins. A failing run could overwrite a passing run's evidence, or vice versa. The atomic write (temp+rename) prevents corruption but does not prevent semantic races. Recommendation: document this limitation or add a `testRunId`-based lock check in `test.evidence.verify` (reject evidence if `testRunId` is older than the file's current `testRunId`).
- **A2 (question):** Dependency on unimplemented RFCs — `dependsOn` enforces ordering via `rfc.implement.stamp` (RFC-IMP-07), but what happens if an agent tries to implement RFC-0829 before RFC-0824–0828 are implemented? The gates will always fail (no evidence files exist). The RFC should note that test commands (RFC-0824–0828) must record evidence before gates can function, and that implementing RFC-0829 first produces a pipeline that blocks all deployments.

### No concerns

- Engine/plugin boundary is correct: `leitstand.propagate` (engine) calls `test.evidence.verify` via `executeKernelCommand` (plugin-registered command). No direct import. DNA-64 respected.
- Reversibility: gates can be removed by deleting the `executeKernelCommand` calls. Forward-only means the evidence format is permanent, which is acceptable.
- New command family `test.evidence.*` is justified — verify and list are distinct operations, not flags on test runners.

## Security Engineer

### Findings

- **S1 (observation):** No security concerns. Test evidence files contain commitSha, test results, and timestamps — no sensitive data. Evidence files in `services/<service-id>/.test-evidence/` are gitignored. Evidence files in `releases/<release-id>/.test-evidence/` are committed as part of release artifacts but contain only deployment metadata already present in release manifests. No new trust boundaries — `test.evidence.verify` reads local files, no network calls. The grace period date constant is not a realistic attack vector (requires code access).

### No concerns

- No data exposure in logs, error messages, or generated artifacts.
- No cookies or client-side storage introduced.

## QA Engineer

### Findings

- **Q1 (concern):** Concurrent test runs — same as A1. Two test runners for the same level can race. The atomic write prevents file corruption, but the last writer wins semantically. A CI run that fails could overwrite a local dev-deploy run that passed, blocking the next propagate. Recommendation: add a `testRunId` comparison in `test.evidence.verify` — only accept evidence with a newer `testRunId` than the existing file.
- **Q2 (observation):** Test seams are clear — unit tests for `test.evidence.verify` (mock evidence files on disk), integration tests for gate behavior in `leitstand.propagate`/`promote` (mock `executeKernelCommand`). Acceptance criteria are checkable by agent (command registration, gate behavior, error messages).

### No concerns

- Failure modes (GATE-01 through GATE-04) are well-defined.
- Empty states (new service with no evidence) addressed in rollout section.
- Staleness (GATE-04) correctly downgraded to warning — commitSha match is the primary freshness guarantee.

## Product Manager

### Findings

- **P1 (observation):** Problem statement is grounded in a real need — DNA-66 explicitly requires test evidence gates, and currently no test evidence is verified at any pipeline stage. The gap is clear and the solution is proportionate.

### No concerns

- Rollout impact is well-managed: 2-week grace period, existing releases grandfathered, new services/sites get a warning during grace period.
- Scope is correctly bounded — only deployment gates, not test execution. Depends on RFC-0824–0828 for test execution.
- `nonGoals` are explicit and meaningful: "Does not define test levels", "Does not implement test runners", "Does not block dev-deploy on test failures".

## Developer Advocate

### Findings

- **D1 (question):** Same as A2 — the RFC should explicitly note that implementing RFC-0829 before its dependencies produces a pipeline that blocks all deployments (no evidence files exist). This is not a bug but a operational reality that agents and operators need to understand. A one-line note in "Implementation notes for agents" would suffice.

### No concerns

- TypeScript contracts are clear and self-contained.
- CLI surface is explicit with concrete examples.
- File system responsibilities table is complete and accurate (fixed during enhance).
- Implementation ordering is clear: storage format → commands → recording → gates.
- Terms are explained in context — no glossary entries needed.

## Consensus findings

- **A1 + Q1 (2 personas):** Concurrent test runs writing to the same evidence file — last writer wins semantically. Recommendation: add `testRunId`-based comparison in `test.evidence.verify` or document this limitation in the RFC.
- **A2 + D1 (2 personas):** Dependency on unimplemented RFCs — implementing RFC-0829 first produces a pipeline that blocks all deployments. Recommendation: add a note in "Implementation notes for agents" explaining this operational reality.

## Unique findings

- **S1 (1 persona):** No security concerns — confidence signal.
- **P1 (1 persona):** Problem statement and scope are well-grounded — confidence signal.

## Recommendation

**Proceed to acceptance with minor revisions.** The two consensus findings are operational notes, not design flaws. They can be addressed by adding two sentences to the RFC's "Implementation notes for agents" section. Route through `fo-idea-enhance` if the operator wants these integrated, or proceed directly to planning — the findings do not block implementation.

No findings does not mean no issues — it means no issues were found from these five perspectives.
