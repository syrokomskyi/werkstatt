---
reviewId: REVIEW-CODE-2026-07-13-23
date: 2026-07-13
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 71e92e692...HEAD
filesReviewed:
  - AGENTS.md
  - docs/architecture-dna.md
  - docs/authoring/site-composition.md
  - docs/historical/rules/README.md
  - docs/knowledge-graph.xml
  - docs/policies/adr-governance.md
  - docs/policies/agent-surface-ops.md
  - docs/policies/architectural-arc.md
  - docs/policies/build-verification.md
  - docs/policies/content-contracts.md
  - docs/policies/generated-file-governance.md
  - docs/policies/integration-hub.md
  - docs/policies/rfc-governance.md
  - docs/policies/windows-tooling.md
  - docs/requirements.xml
  - docs/rfcs/index.yaml
  - packages/forge/os/rfc/handlers.ts
  - packages/forge/os/rfc/handlers/index-graph.ts
  - packages/forge/os/rfc/rfc.module.ts
  - packages/integration/package.json
  - packages/integration/src/index.ts
  - packages/integration/src/port-barrel.ts
  - packages/integration/src/crm-buffer.ts
  - packages/integration/tsconfig.json
  - packages/integration/vitest.config.ts
  - packages/share/package.json
  - packages/share/src/integration/crm-buffer.ts
  - packages/share/src/integration/index.ts
  - packages/share/src/integration/port-barrel.ts
  - packages/os/site-kernel-checks/src/agent/agent-capability.ts
  - packages/os/site-kernel-checks/src/agent/agent-environment-audit.ts
  - packages/os/site-kernel-checks/src/agent/agent-gate-fixtures.ts
  - packages/os/site-kernel-checks/src/agent/agent-knowledge-compute.ts
  - packages/os/site-kernel-checks/src/agent/agent-knowledge.ts
  - packages/os/site-kernel-checks/src/agent/agent-manifest.ts
  - packages/os/site-kernel-checks/src/agent/agent-openapi.ts
  - packages/os/site-kernel-checks/src/agent/agent-routes.ts
  - packages/os/site-kernel-checks/src/agent/agent-surface-sign.ts
  - packages/os/site-kernel-checks/src/command-tables/index.ts
  - packages/os/site-kernel-checks/src/command-tables/governance-checks.ts
  - packages/os/site-kernel-checks/src/command-tables/build-infra.ts
  - packages/os/site-kernel-checks/src/command-tables/fleet-bordbuch.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/env/env-contract.ts
  - packages/os/site-kernel-checks/src/env/env-example.ts
  - packages/os/site-kernel-checks/src/index.ts
  - packages/os/site-kernel-checks/src/kernel-flags-lint.ts
  - packages/os/site-kernel-checks/src/maintenance/maintenance-debt-baseline.ts
  - packages/os/site-kernel-checks/src/maintenance/maintenance-debt-queue.ts
  - packages/os/site-kernel-checks/src/pipeline/pipeline-cache-parity.ts
  - packages/os/site-kernel-checks/src/pipeline/pipeline-contract.ts
  - packages/os/site-kernel-checks/src/pipeline/pipeline-idempotency.ts
  - packages/os/site-kernel-checks/src/pipeline/pipeline-log-hygiene.ts
  - packages/os/site-kernel-checks/src/pipeline/pipeline-telemetry.ts
  - packages/os/site-kernel-checks/src/pseo/pseo-governance.ts
  - packages/os/site-kernel-checks/src/pseo/pseo-module-context.ts
  - packages/os/site-kernel-checks/src/pseo/pseo-product.ts
  - packages/os/site-kernel-checks/src/pseo/pseo-proof.ts
  - packages/os/site-kernel-checks/src/pseo/pseo-visibility.ts
  - packages/os/site-kernel-checks/src/pseo/pseo.ts
  - packages/os/site-kernel-checks/src/registry.ts
  - packages/os/site-kernel-checks/src/workspace-write-boundary.ts
  - packages/os/site-kernel-checks/src/video/video-fallback.ts
  - packages/os/site-kernel-checks/src/video/video-media.ts
  - packages/os/site-kernel-checks/src/video/video-variants.ts
  - packages/os/site-kernel/src/rfc/handlers/index-graph.ts
  - packages/os/site-kernel/src/rfc/rfc.module.ts
---

# Code Review: 71e92e692...HEAD (8 refactorings)

### Verdict: Needs revision

The diff is a large-scale refactoring (150 files, 8 logical changes) that is mechanically sound — all three affected packages pass `build:check` and the integration test suite is green. However, Axis D finds a forward-only violation: the `@gogol/share/integration/*` backward-compat re-export barrels are compatibility shims that should be removed, not maintained. Axis C finds that `docs/ecosystem.generated.yaml` is stale (missing `@gogol/integration` package entry) and `docs/policies/integration-hub.md` still references `@gogol/share/integration` instead of `@gogol/integration`.

### Mechanical floor

- `@gogol/site-kernel-checks` `build:check` — **pass**
- `@gogol/integration` `build:check` — **pass**
- `@gogol/share` `build:check` — **pass**
- `@gogol/integration` tests — **31/31 pass**
- `@gogol/site-kernel-checks` tests — **228/234 pass** (5 pre-existing failures unrelated to this diff; 1 caused by diff fixed in `bc4a0ec61`)

### Axis A — Structural correctness

- **No issues.** All file moves are pure renames with import path adjustments. No logic changes, no new abstractions. The consolidation of 14 small command-table files into 4 thematic groups is a clean merge — each consolidated file imports from its constituents and exports a single combined array.
- **Minor formatting**: `kernel-flags-lint.ts` has whitespace fixes (indentation alignment, line wrapping) that are cosmetic but harmless.

### Axis B — DNA alignment

- **DNA-1 (monorepo boundary)** — **pass.** The new `@gogol/integration` package follows the `packages/*` boundary contract. No `apps/* → apps/*` imports introduced.
- **DNA-6 (kebab-case)** — **pass.** All new subdirectory names (`agent/`, `pseo/`, `maintenance/`, `pipeline/`, `video/`, `env/`) use kebab-case. New package directory `packages/integration/` is kebab-case.
- **DNA-42 (Compass markup)** — **pass.** New non-trivial source files in `@gogol/integration` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` semantic scaffolding (verified in `index.ts`, `port-barrel.ts`, `crm-buffer.ts`). The backward-compat re-export barrels in `@gogol/share/integration/` also carry `MODULE_CONTRACT` markup.
- **DNA-51 (Werkstatt primitives)** — **N/A.** No mutating Werkstatt commands added or changed.

### Axis C — Ecosystem fit

- **FAIL — `docs/ecosystem.generated.yaml` is stale.** The new `@gogol/integration` package does not appear in the ecosystem projection. Per AGENTS.md: "When workspace topology, root pipelines, or command surfaces change, update the generator/registries first, then run `ecosystem.manifest.generate`." The extraction of `@gogol/integration` from `@gogol/share` is a workspace topology change. The file must be regenerated.
- **FAIL — `docs/policies/integration-hub.md` references `@gogol/share/integration` (2 occurrences).** Lines 7 and 32 still say "Contracts live in `@gogol/share/integration`" and "CF-queue primitives still exported from `@gogol/share/integration`". These should reference `@gogol/integration` (the new canonical location) with an optional note that `@gogol/share/integration` re-exports for backward compat.
- **Additional stale `@gogol/share/integration` references** exist in `docs/specs/visitor-funnel/*.md` (5 files) and `docs/specs/integration-delivery.md` (1 file). These are pre-existing docs not touched by this diff, but the extraction makes them stale. At minimum, `docs/policies/integration-hub.md` (which was created/modified in this diff) must be updated.
- **Package boundaries** — **pass.** `@gogol/share` now depends on `@gogol/integration` (workspace:*), and `@gogol/integration` has no dependency on `@gogol/share`. The dependency direction is correct.
- **AGENTS.md decomposition** — **pass.** The root `AGENTS.md` now delegates to `docs/policies/*.md` files with correct cross-references. The `docs/knowledge-graph.xml` and `docs/requirements.xml` were updated to reflect the `apps/AGENTS.md` → `docs/authoring/site-composition.md` migration.
- **Command lifecycle** — **pass.** `rfc.index.validate` is registered in `rfc.module.ts` with correct metadata. `kernel-flags-lint.ts` was updated to include the new command in `KERNEL_FLAG_SCHEMA_SOURCES`.

### Axis D — Forward-only compliance

- **FAIL — Backward-compat re-export barrels in `@gogol/share/integration/`.** Three files (`index.ts`, `port-barrel.ts`, `crm-buffer.ts`) are pure re-export shims to `@gogol/integration`. Per forward-only discipline: "No compatibility shims, bridges, or dual-paths that keep legacy behavior alive." The diff should update all consumers to import from `@gogol/integration` directly and delete the shims. The `@gogol/share/package.json` `exports` map still exposes `./integration`, `./integration/port`, and `./integration/crm-buffer` — these export paths should be removed once consumers are migrated.

  **Counterpoint:** The shims are marked with `MODULE_CONTRACT` noting "backward compat" and `CHANGE_SUMMARY` noting "Extraction: integration hub moved to @gogol/integration; this file re-exports for backward compat." This is a deliberate transitional measure, not an indefinite grace period. However, forward-only discipline requires removal in the same change, not a deferred cleanup.

### Axis E — Agent-facing clarity

- **Pass.** The `MODULE_CONTRACT` blocks in the new `@gogol/integration` files clearly state the purpose, non-goals, and change history. The backward-compat barrels explicitly mark themselves as such, so an agent reading them will understand they are looking at a delegation, not the canonical source.
- **No ungrounded assertions** found in new code. Comments in `index-graph.ts` correctly reference `RFC_DIR`, `listRfcFiles`, and the YAML output path.
- **Compass scaffolding** — **pass** for new non-trivial files. The moved files in `site-kernel-checks/src/{agent,pseo,pipeline,maintenance,video,env}/` retain their existing Compass markup (none was stripped or added).

### Axis F — Pragmatism

- **Pass.** The refactoring is purely organizational — no new commands, no new abstractions, no speculative generality. The subdirectory grouping is logical and matches the file naming convention (`agent-*` → `agent/`, `pseo-*` → `pseo/`, etc.).
- **Command-table consolidation** — **pass.** 14 small files merged into 4 thematic groups reduces import surface without losing traceability. Each consolidated file has a clear theme (governance, build-infra, fleet-bordbuch, infra-contracts).
- **Scope discipline** — **pass.** The diff touches only what's necessary for the 8 refactorings. No scope creep into unrelated areas.

### Axis G — Blind spots

- **Performance** — **N/A.** No new build-time commands that scan files.
- **False positives** — **N/A.** No new validators.
- **Edge cases** — The `rfc.index.validate` command correctly handles the missing-index case (RFC-IDX-01), unparseable-YAML case (RFC-IDX-02), and count-mismatch case (RFC-IDX-03). The early-return pattern for missing/unparseable index is correct.
- **Migration path** — The `SHARED_WRITE_ALLOWLIST` path for `maintenance-debt-queue.ts` was initially missed and caused a test failure. This was fixed in `bc4a0ec61`. The `fleet-sites-generate.ts` WS-WRITE-02 failure is pre-existing and unrelated.
- **Security / privacy** — **N/A.** No user data, PII, or external service changes.

### Spec compliance

No spec available — spec compliance skipped. The 8 refactorings were self-defined by the operator during the session.

### Questions for the author

1. **Why are the `@gogol/share/integration/*` backward-compat re-export barrels kept instead of migrating all consumers to `@gogol/integration` directly?** Forward-only discipline requires removal in the same change. If there are too many consumers to migrate in one pass, document the migration plan and timeline.
2. **When will `docs/ecosystem.generated.yaml` be regenerated?** The new `@gogol/integration` package is missing from the projection. Per AGENTS.md, topology changes require regeneration.
3. **Should `docs/policies/integration-hub.md` be updated to reference `@gogol/integration`?** The policy file was created in this diff but still references `@gogol/share/integration` as the canonical contract location.
