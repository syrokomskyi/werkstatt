---
rfc: RFC-0790
createdAt: 2026-08-09
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 5
---

# Design Summit: RFC-0790

**RFC:** Move per-system configuration into cache clone and replace fleet registry with convention-based discovery

**Status:** accepted (transitioned from draft for planning)

**Audit verdict:** Needs revision (3 errors, 15 warnings — all addressed in enhance)

## Architect

### Findings

- **A1 (concern):** The `resolveCachePath()` function currently reads `mirrors[0].path` from the registry entry. The RFC replaces this with `resolveCacheClonePath(workspaceRoot, systemId)` which derives `../systems-cache/<id>/` by convention. But the current `mirrors[0].path` in `systems/registry.yaml` for warpgogol-com is `../systems-cache/warpgogol-com` — it matches the convention. However, the RFC does not address what happens if a system's `mirrors[0].path` does NOT match the convention `../systems-cache/<id>/`. The migration step "create per-system files in cache clone" assumes the cache clone is already at `../systems-cache/<id>/`. If any system has a non-convention cache path, the migration would need to relocate the cache clone itself, which is a git repo move. The RFC should state that the convention path is mandatory and systems with non-convention paths must be relocated during migration.

- **A2 (concern):** `werkstatt-site` imports `fleetRegistrySchema` and `fleetRegistryEntrySchema` via re-export from `@warpgogol/werkstatt/schemas` (through `@warpgogol/werkstatt-site/ontology/operations/index.ts` which re-exports from `@warpgogol/werkstatt/schemas`). The RFC's acceptance criteria say these schemas are removed, but the re-export in `werkstatt-site` is not mentioned. The plan must update `packages/werkstatt-site/src/domain/ontology/operations/index.ts` and all consumers (`studio-gate/auth.ts`, `checks/analytics-matomo.ts`, `checks/audit/validators/analytics-config.ts`, `checks/audit/validators/helpers.ts`, `checks/source-monitor.ts`).

- **A3 (question):** The `resolveMirrors()` function currently takes a `FleetRegistryEntry` and resolves all mirrors. With the RFC, it would take a `SystemConfig` instead. But `resolveMirrors()` is also used by `sternsystem.validate` and `sternsystem.sync` to iterate mirrors. The function signature change from `FleetRegistryEntry` to `SystemConfig` is straightforward (both have `mirrors[]`), but the plan should verify that all call sites are updated.

### No concerns

- The convention-based discovery pattern is well-established (RFC-0666 for `.env` paths). Applying it to fleet registry is a natural extension.
- The DNA alignment is comprehensive after the enhance (DNA-1, DNA-44, DNA-45, DNA-46, DNA-47 all addressed).
- The `deploymentStaticConfigSchema` correctly separates static config from runtime state.

## Security Engineer

### Findings

- **S1 (concern):** `system-config.yaml` contains `cloudflareZoneId` and `owner` (did:web VC subject id). `system-state.yaml` contains `currentMission`, `lastRelease`, and `lastPropagated` with operation IDs and lease expiry timestamps. These files live in the cache clone's git repo and are propagated to external mirrors via `sternsystem.sync`. If an external mirror is public (e.g., GitHub), this exposes operational metadata that was previously only in the monorepo's `systems/registry.yaml`. The RFC should address whether external mirrors are expected to be private, or whether sensitive fields should be redacted/encrypted in the cache clone. At minimum, the RFC should acknowledge this exposure and state the operator's responsibility to keep external mirrors private.

- **S2 (question):** The `studio-gate/auth.ts` in `werkstatt-site` currently reads `fleetRegistrySchema` to parse the registry for authentication. With the RFC, this file would need to read `system-config.yaml` instead. The auth flow depends on the registry to find the system's owner. The plan should verify that the studio gate auth flow is updated to use `readSystemConfig()` and that the owner field is correctly migrated.

### No concerns

- No new trust boundaries are created — the same data moves from one location to another.
- No cookies or client-side storage are introduced.
- `atomicWriteFile` is used for state writes, preventing partial writes.

## QA Engineer

### Findings

- **Q1 (concern):** The migration order in the RFC is: (1) create cache clone files, (2) update engine code, (3) delete registry. But step 2 says "update all ~200 call sites." If the engine code is updated to use `discoverSystems()` but a call site is missed, it will fail at runtime. The plan should include a TypeScript compile check (`pnpm --filter @warpgogol/werkstatt run build:check`) after the engine code update to catch missed call sites at compile time, not at runtime.

- **Q2 (concern):** `discoverSystems()` scans `../systems-cache/` for directories with `system-config.yaml`. What happens if a directory has a `system-config.yaml` that fails Zod validation? The RFC says "Zod parse failure is reported as a validation error with the system id and field path." But `discoverSystems()` should not throw on a single bad config — it should skip the bad system and continue scanning, collecting errors. The plan should specify that `discoverSystems()` returns `{ systems: SystemConfig[], errors: Array<{ id: string, error: ZodError }> }` or similar.

- **Q3 (concern):** The test suite for `registry-io.ts` (`resolve-mirrors.test.ts`) tests `resolveMirrors()`, `resolveMirrorPath()`, `inferMirrorProtocol()`, `isGitAccessible()`. These tests use `FleetRegistryEntry` objects. With the RFC, `resolveMirrors()` takes `SystemConfig` instead. The tests need to be updated to use `SystemConfig` objects. The plan should include a test update step.

### No concerns

- Empty state is well-handled: missing `system-state.yaml` is treated as fresh system.
- Concurrent state writes are addressed via `atomicWriteFile` and per-system files.
- Acceptance criteria are checkable by an agent.

## Product Manager

### Findings

- **P1 (concern):** The RFC does not have a `nonGoals` section. While the "Alternatives considered" section covers rejected approaches, it doesn't explicitly state what is out of scope. For example: is sharding of `../systems-cache/` out of scope? Is configurable cache clone path out of scope? Is backward compatibility out of scope? The plan should note that the "Alternatives considered" section serves as the de facto `nonGoals` list, but a future RFC enhancement could add an explicit `nonGoals` section.

### No concerns

- The problem statement is grounded in a real architectural issue (central registry bottleneck).
- The rollout is well-structured: atomic migration within one mission.
- The scope is broad but justified — replacing a central data structure requires touching all consumers.
- The RFC addresses operator impact (grep `registry.yaml` → `sternsystem.list`).

## Developer Advocate

### Findings

- **D1 (concern):** The RFC says "update all ~200 call sites across ~48 files." This is a large surface area. An agent implementing this RFC needs a systematic approach: first update the schemas and IO helpers, then run `pnpm --filter @warpgogol/werkstatt run build:check` to get a list of all TypeScript errors (which correspond to missed call sites), then fix each error. The plan should include this iterative compile-driven approach rather than trying to enumerate all call sites manually.

- **D2 (question):** The RFC introduces `sternsystem.discover` as a new command. But the RFC's `commands.proposed` frontmatter lists `sternsystem.discover`. The kernel command registration in `tools/kernel.config.ts` needs to be updated. The plan should include this registration step.

### No concerns

- The implementation notes are explicit with MUST/MAY/MUST NOT directives.
- The RFC is self-contained — a new agent can understand it without external context.
- The `AGENTS.md` update is specific about which sections to update.
- Terms are well-defined: "convention-based discovery", "system-config.yaml", "system-state.yaml".

## Consensus findings

- **A1 + Q1 (2 personas):** Migration path and testing. The migration assumes all cache clones are at the convention path `../systems-cache/<id>/`. The plan should verify this assumption and handle non-convention paths. The plan should use compile-driven iteration to catch all call sites.

- **A2 + S2 + D1 (3 personas):** `werkstatt-site` coupling. The `werkstatt-site` package imports `fleetRegistrySchema` and `fleetRegistryEntrySchema` via re-export. All consumers (studio-gate, analytics-matomo, source-monitor, audit validators) need updating. The plan must include a `pnpm --filter @warpgogol/werkstatt-site run build:check` step.

## Unique findings

- **A3:** `resolveMirrors()` signature change from `FleetRegistryEntry` to `SystemConfig` — verify all call sites.
- **S1:** External mirror exposure of `cloudflareZoneId` and operational metadata — acknowledge in RFC or plan.
- **Q2:** `discoverSystems()` error handling — should collect errors, not throw on single bad config.
- **Q3:** Test suite update for `resolve-mirrors.test.ts` — use `SystemConfig` objects.
- **P1:** No explicit `nonGoals` section — alternatives serve as de facto non-goals.
- **D2:** Kernel command registration for `sternsystem.discover` in `tools/kernel.config.ts`.

## Recommendation

**Proceed to planning.** The consensus findings (A1+Q1, A2+S2+D1) are addressed by the plan's step structure: contracts first, then IO helpers, then compile-driven call site updates, then tests. The unique findings are plan-level details that should be incorporated into the plan steps.

No findings require RFC revision — they are all implementation-level concerns that the plan should address.

*Disclaimer: No findings does not mean no issues — it means no issues were found from these five perspectives.*
