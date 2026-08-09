---
rfc: RFC-0775
createdAt: 2026-08-09
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 4
---

# Design Summit: RFC-0775

## Architect

### Findings

- **A1 (concern):** `pbp-rate-adapters` is listed in `packagesImpacted` and folds into `domain/pbp/` per the domain table, but the subpath export table does not include a mapping for `@warpgogol/pbp-rate-adapters`. Consumers importing `@warpgogol/pbp-rate-adapters` (e.g. for `createEcbAdapter`, `parseEcbXml`) need a new specifier. The plan must decide: is it `@warpgogol/werkstatt-site/pbp-rate-adapters` or folded into `@warpgogol/werkstatt-site/pbp`?
- **A2 (concern):** `packages/share` currently has 195 items in `src/`. RFC-0771 sends operations schemas to the engine; the site-facing remainder comes here. The file-level split is non-trivial — consumers importing `@warpgogol/share` for operations types (e.g. `@warpgogol/share/integration` hub contracts) may break if those types moved to the engine. The plan should verify which `share` subpath exports are operations vs site-facing before moving.

### No concerns

- The dependency direction (domain → engine, domain → domain, no domain → forge) is clearly specified.
- The `checks/` vs `domain/check-core/` and `domain/observability/` vs engine `observability/` boundaries are now well-documented after enhance.
- The `warpgogol-skills` exclusion is correctly resolved — RFC-0771 (implemented) places it workshop-local.

## Security Engineer

### Findings

- **S1 (concern):** `domain/studio-gate/` is the MCP server enforcing DNA-56 (no direct filesystem access — only MCP tools with `clientEditable[]` whitelist). The RFC says "preserved, not extended" but doesn't explicitly state that the MCP tool projections (`workpiece.read`, `workpiece.write`) continue to enforce the `clientEditable[]` whitelist after the physical move. The plan should include a verification step that confirms the whitelist enforcement is intact post-move.

### No concerns

- No new trust boundaries — the consolidation is a physical reorganization, not a contract change.
- No new persistence, cookies, or client-side storage.
- LFS assets (LordIcon JSON, PNGs) are public visual assets — no sensitive data exposure risk.

## QA Engineer

### Findings

- **Q1 (concern):** Subpath export resolution is a runtime concern, not just a typecheck concern. TypeScript may resolve via `tsconfig.json` path aliases even if `package.json` `exports` map is wrong. The plan should include a runtime smoke test that imports from each subpath export and verifies resolution.
- **Q2 (concern):** `packages/ui` has 2683 items. Moving it in one step is risky — a single misconfigured import path could break the entire build. The plan should consider moving `ui` in sub-steps (e.g., `sections/` first, then `components/`, then `icons/`) or at minimum include a checkpoint after the `ui` move.

### No concerns

- The acceptance criterion "Existing test suites pass without assertion changes" is a strong testability signal.
- Empty states are not a concern — a new workshop gets the full plugin from npm.

## Product Manager

### No concerns

- The problem is grounded: one npm install for any site workshop.
- The rollout is clear — same wave as RFC-0774 (implemented), migration sweep in RFC-0776.
- Scope is correctly bounded: no engine modules, no migration, no new features, no warpgogol-skills.
- `nonGoals` are explicit and meaningful after enhance.

## Developer Advocate

### Findings

- **D1 (concern):** The RFC doesn't mention updating `pnpm-workspace.yaml`. After consolidation, ~27 workspace package entries are removed. The plan must include this update — pnpm will fail if workspace entries point to deleted directories.
- **D2 (concern):** The `tsconfig.json` for `packages/werkstatt-site` will need path aliases or project references for the new `src/domain/` structure. The RFC doesn't mention tsconfig changes. The plan should include updating `tsconfig.json` to reflect the new internal structure.

## Consensus findings

- **A1 + D1 (2 personas):** Completeness gaps in the move plan — `pbp-rate-adapters` subpath export mapping is missing (A1), and `pnpm-workspace.yaml` update is not mentioned (D1). Both are plan-level gaps that the implementation plan must address.
- **Q2 + A2 (2 personas):** Risk of large-batch moves — `packages/ui` (2683 items) and `packages/share` (195 items with a non-trivial engine/site split) are the two highest-risk moves. The plan should sequence these carefully with checkpoints, not batch them with simpler packages.

## Recommendation

Proceed to planning. The findings are plan-level gaps, not RFC-level defects. The implementation plan should:

1. Include `pbp-rate-adapters` in the subpath export mapping (resolve A1).
2. Include `pnpm-workspace.yaml` update in the step sequence (resolve D1).
3. Add a runtime smoke test for subpath exports alongside typecheck (resolve Q1).
4. Sequence `packages/ui` and `packages/share` moves with intermediate checkpoints (resolve Q2 + A2).
5. Include a verification step for Studio Gate whitelist enforcement post-move (resolve S1).
6. Include `tsconfig.json` updates in the step sequence (resolve D2).

No findings does not mean no issues — it means no issues were found from these five perspectives.
