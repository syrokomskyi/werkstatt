# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-07-27 — RFC-0566 plan grilling

- **Question:** How to track previous artifact for rollback?
- **Answer:** Previous symlink — `.werkstatt/artifacts/platform/previous` symlink, filesystem is the only state source.
- **Question:** How to build platform artifact — `pnpm build` vs Turborepo?
- **Answer:** `turbo run build` — use existing Turborepo infrastructure with caching and dependency ordering.
- **Question:** Include two-phase commit types in pilot plan or defer entirely?
- **Answer:** Types only, stub logic — define `WorkshopDeployStatus` and `TwoPhaseCommitResult` in types.ts but don't implement logic. Contracts first, implementation in Phase 4 RFC.
- **Question:** How to sign artifact manifest when `signLatestBuildArtifacts` expects `.integrity/` structure?
- **Answer:** Export `signPayload` from `@warpgogol/site-kernel-integrity` — it already exists internally, just needs to be added to public API exports.
