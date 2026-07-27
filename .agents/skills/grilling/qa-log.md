# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-07-27 — RFC-0564 plan grilling

- **Question:** SWIM process lifecycle — SWIM is long-running but kernel commands are ephemeral CLI. Who keeps SWIM alive?
- **Answer:** Ephemeral per-command. swim.join starts SWIM, joins, records genome log, exits. No daemon. swim.members reads from genome log only.

## 2026-07-27 — RFC-0564 plan grilling

- **Question:** Where does workshopId (UUID) come from?
- **Answer:** Generate UUID v7 in swim.join on first call, store in werkstatt.swim.json. Use `uuid` package's `v7` function (already used in site-kernel-integrity).

## 2026-07-27 — RFC-0564 plan grilling

- **Question:** swim npm package has farmhash native dependency — how to handle?
- **Answer:** Use swim package, handle native deps. If build fails, investigate pure-JS alternatives at implementation time.

## 2026-07-27 — RFC-0564 plan grilling

- **Question:** RFC-0564 depends on RFC-0558 (identity model) which is also draft — should plan depend on it?
- **Answer:** RFC-0558 is already implemented. Depend on it — fail with identity-not-bootstrapped if identity is not set up.

## 2026-07-27 — RFC-0566 plan grilling

- **Question:** How to track previous artifact for rollback?
- **Answer:** Previous symlink — `.werkstatt/artifacts/platform/previous` symlink, filesystem is the only state source.
- **Question:** How to build platform artifact — `pnpm build` vs Turborepo?
- **Answer:** `turbo run build` — use existing Turborepo infrastructure with caching and dependency ordering.
- **Question:** Include two-phase commit types in pilot plan or defer entirely?
- **Answer:** Types only, stub logic — define `WorkshopDeployStatus` and `TwoPhaseCommitResult` in types.ts but don't implement logic. Contracts first, implementation in Phase 4 RFC.
- **Question:** How to sign artifact manifest when `signLatestBuildArtifacts` expects `.integrity/` structure?
- **Answer:** Export `signPayload` from `@warpgogol/site-kernel-integrity` — it already exists internally, just needs to be added to public API exports.
