# Site Kernel Package Guide

This file defines the package-specific instruction layer for `packages/os/site-kernel`.

## Package role

- `@warpgogol/site-kernel` is the framework-free core for workspace discovery, runtime context, registry, pipelines, and CLI execution.
- Keep this package portable across apps and adapters.
- Do not couple it to Astro-only concepts unless they are expressed as generic abstractions.

## Core boundaries

- Discovery logic owns workspace/app detection and config loading.
- Runtime logic owns command parsing, context resolution, and command/pipeline execution.
- Registry logic owns command and pipeline registration.
- Types define the stable public contract and should stay explicit.

## WorkspaceIO mutation tracking (RFC-0326)

- `createDefaultIO()` returns `{ io, intents }`.
- The executor passes `fileIntents: intents` on `KernelRuntimeContext` for real runs and uses `createRecordingIO().intents` for `--dry-run`.
- `executeRegisteredCommand` converts captured `WriteIntent[]` into workspace-root-relative `filesModified` on every `KernelExecutionReport`.
- Pipeline executors aggregate per-step `filesModified` into `KernelPipelineReport.filesModified` (deduplicated).
- CLI pretty mode prints `[Modified N file(s): ...] Re-read before editing.` after a successful command or pipeline when the report has a non-empty `filesModified` array.

## Implementation rules

- Keep errors actionable and tied to the current workspace or app context.
- Avoid leaking app-specific directory assumptions beyond clearly named adapter surfaces.
- **Reserved CLI flags:** `consumeCommonFlags` in `src/cli/index.ts` consumes `--site`, `--all`, `--dry-run`, `--force`, and `--json` before a command executes — a command-level flag with one of these names silently never reaches the handler. When a command needs "all" semantics for its own domain, use a distinct name (e.g. `--all-skills` in `forge.skill.knowledge.compact`).
- When adding flags or command semantics, keep parsing stable and backward-conscious.
- **RFC-0086 — surface fail diagnostics, do not just count them.** When a kernel command returns `{ exitCode > 0, data }`, populate one of the recognized arrays so the text-mode printer can emit each item: `data.diagnostics: string[]`, `data.violations: object[]`, `data.findings: object[]` (RFC-0074 audit shape), or `data.details: object[]`. The runtime printer picks the first match (precedence in that order), formats each as `[ERROR]   <ruleId-or-severity> · <file-or-target> · <message>`, and caps at 50 lines with a `… and N more` footer. Agents reading text output no longer need to re-run with `--json` to learn what failed.

## Gate metadata (RFC-0518)

- `KernelCommandMetadata` includes an optional `gate?: GateMetadata` field for declarative gate metadata.
- `GateMetadata` (`GateSeverity`, `GatePhase`, `GateConditional`) is exported from `@warpgogol/site-kernel` and consumed by `ecosystem.manifest.generate` and `gate.catalog.generate` (RFC-0519).
- Gate metadata is purely declarative — it does NOT affect execution, caching, or pipeline order.
- Agents SHOULD backfill `gate` metadata on commands they touch, reducing GATE-CAT-03 warnings over time.

## Template placeholder format

- All template files in `src/templates/` must use the `{{TOKEN_NAME}}` placeholder format.
- Token substitution is handled by `applyTokens()` which replaces `{{\s*(\w+)\s*}}` patterns.
- Do not use custom placeholder formats like `app-name` or other ad-hoc patterns.
- Token names should be UPPER_CASE with underscores (e.g., `{{APP_NAME}}`, `{{CLIENT_ID}}`, `{{DEFAULT_LANG}}`).

## Operator and extension guide

- Full documentation for operating and extending the site OS lives in `packages/os/site-kernel/docs/site-os.md`.
- Read it before adding commands, modules, pipelines, or onboarding a new app.
- For Compass source-file rollout work, follow `docs/source-markup.xml` and consult `docs/compass-inventory.xml` for the current repository snapshot.

## Architecture standards

Cross-site architectural standards used by all apps are documented in `docs/`:

| Document                      | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `docs/architecture-dna.md`    | 18 invariants with enforcement status         |
| `docs/naming-conventions.md`  | File naming rules per layer                   |
| `docs/anti-patterns.md`       | 16 forbidden patterns                         |
| `docs/page-contracts.md`      | Page archetypes and definition of done        |
| `docs/component-contracts.md` | Component classes and mirroring rules         |
| `docs/semantic-layer.md`      | Projection-based semantic output architecture |
| `docs/scaling-playbook.md`    | How to grow a site without breaking the DNA   |

## RFC governance

- The `rfc.*` command domain has migrated to `@warpgogol/forge/os/rfc` (RFC-0374, RFC-0391). The former `src/rfc/` tree is deleted.
- site-kernel re-exports RFC types and handlers from `@warpgogol/forge/os/rfc` in `src/index.ts` for backward-compatible imports.
- The `forgeRfcModule` is registered in `tools/kernel.config.ts` via `@warpgogol/forge/os/rfc-module`.
- RFC files live in `docs/rfcs/` at the workspace root.
- Agent behavioral rules for RFCs are in the root `AGENTS.md`, not per-RFC.

## Kernel cache (RFC-0382)

- `src/cache/` — SQLite-backed cache layer for accelerating RFC commands.
- `cache-layer.ts` — `CacheLayer` interface, `createCacheLayer` factory (tries SQLite, falls back to NoopCacheLayer).
- `sqlite-cache-layer.ts` — `SqliteCacheLayer` using `better-sqlite3` (optional dependency). WAL mode, 5s busy timeout, self-healing on corrupt DB.
- `noop-cache-layer.ts` — `NoopCacheLayer` fallback when `better-sqlite3` is missing or native binary incompatible.
- `rfc-cache.ts` — RFC-specific cache helpers (`getCachedRfcEntries`, `getCachedRfcEntry`, `rfcCacheEntryToParsedRfc`). Uses `@warpgogol/fingerprint` for content hashing (DNA-53).
- `cache-module.ts` — registers `kernel.cache.status` and `kernel.cache.clear` commands.
- Cache DB stored at `.cache/kernel-cache.db` (gitignored).
- All RFC commands support `--force-cache-refresh` flag to bypass cache.
- Manifest-first lifecycle validation: lifecycle handler in `@warpgogol/forge/os/rfc` reads command names from `docs/command-manifest.generated.yaml` first, falls back to `listRegisteredKernelCommands` when manifest is stale.

## Command-result cache (RFC-0390)

- `src/cache/command-result-cache.ts` — command-result cache helpers: `COMMAND_RESULT_CACHE_NAMESPACE`, `COMMAND_RESULT_CACHE_SCHEMA_VERSION`, `CommandResultCacheKey`, `buildCommandResultCacheKey`, `computeInputsHash`, `computeModuleHash`, `getCachedCommandResult`, `setCachedCommandResult`. All hashing uses `@warpgogol/fingerprint` (DNA-53).
- The `command_results` namespace stores full `KernelExecutionReport` objects keyed by schema version + command name + site name + inputs hash + module hash.
- Pipeline executors (`executePipelineForSite`, `executePipelineForWorkspace`) check the cache before executing a command. On hit, the cached report is returned with `cached: true` and `durationMs: 0`. On miss, the command executes; only `ok: true` results are stored.
- `--force` flag bypasses cache reads but still writes successful results (refreshing entries). `dryRun` mode bypasses the cache entirely (no read, no write).
- RFC-0635: the `--force` flag is now passed through to `executeKernelCommand` for individual command invocations (previously only pipeline execution). Command handlers read it from `input.flags.force`.
- `cacheable: false` on a command opts out of caching entirely — the command always executes and is never stored or retrieved from the cache.
- `computeModuleHash` is cached per-package per-pipeline-run in a `Map<string, string>` to avoid re-hashing the same `src/` directory for every command in a package. RFC-0637: the cache key now includes `command.modulePaths` (joined by `,`) so commands with different `modulePaths` get independent cache entries.
- RFC-0637: `KernelCommandDefinition` has an optional `modulePaths?: string[]` field. When present, `computeModuleHash` fingerprints only the listed paths (files and/or directories relative to the module's `src/` directory) instead of the full `src/` directory. When absent or empty, the full `src/` fingerprint is used (permanent backward-compatible fallback). Non-existent paths are silently skipped.
- `command.reads.validate` (in `@warpgogol/site-kernel-checks`) enforces that every registered command declares `reads` or `cacheable: false` (CRC-01) and that `reads` patterns are valid picomatch syntax (CRC-02).

## Workspace tree index and mtime fast path (RFC-0685)

- `src/cache/workspace-tree-index.ts` — `WorkspaceTreeIndex` (Map from POSIX-relative file paths to `{ mtimeMs, size }`), `buildWorkspaceTreeIndex` (single directory walk excluding `.git/` and `node_modules/`), `filterTreeIndex` (in-memory picomatch glob filtering against the index).
- Pipeline executors (`executePipelineForSite`, `executePipelineForWorkspace`) build the tree index once per pipeline run via `buildWorkspaceTreeIndex(options.workspaceRoot)` and pass it to `tryCacheRead` and `tryCacheWrite`.
- `computeInputsHash` accepts an optional `treeIndex` parameter. When provided, `expandGlobs` filters the index in-memory instead of walking the filesystem — replacing N directory walks with one walk + N in-memory filters.
- `computeInputsHash` returns `{ hash, metadata }` where `metadata` is an array of `InputsMetadataEntry` (`{ path, mtimeMs, size }`) sorted by path. The metadata is used by the mtime fast path.
- Byte-mode fingerprinting: `selectFingerprintMode` picks `"byte"` for content extensions (`.md`, `.yaml`, `.yml`, `.json`, `.jsonc`, `.txt`) and `"semantic"` for source extensions (`.ts`, `.tsx`, `.astro`, `.css`, `.js`, `.mjs`). Semantic normalization on content files offers no benefit and wastes CPU.
- Cache entry wrapper format: `getCachedCommandResult` returns `CachedCommandResultEntry` (`{ report, inputsMetadata?, inputsHash? }`). Legacy bare `KernelExecutionReport` entries are detected by absence of the `report` field and unwrapped. `setCachedCommandResult` stores the wrapper including `inputsMetadata` and `inputsHash`.
- Mtime fast path in `tryCacheRead`: when a tree index is available, `tryMtimeFastPath` builds current metadata from the tree index, hashes it via `stableJsonHash`, and looks up a `command_results_meta` namespace entry mapping the metadata hash to the previously stored `inputsHash`. If found, the cached result is retrieved using that `inputsHash` — skipping all file content reads and fingerprinting.
- `tryCacheWrite` stores the metadata-to-inputsHash mapping in `command_results_meta` after a successful cache write, enabling future mtime fast path hits.
- The `command_results_meta` namespace uses the same `CacheLayer` interface as `command_results`. Keys are `meta:<commandName>:<siteName>:<metadataHash>`.
- Tree index construction failures are non-fatal — the pipeline falls back to per-command filesystem walks when `treeIndex` is `undefined`.

## Pipeline dependency graph (RFC-0686)

- `src/runtime/pipeline-scheduler.ts` — dependency-aware pipeline scheduler. Exports `buildSchedule`, `executeScheduledSteps`, `ScheduledStep`, `StepExecutionResult`, `ScheduleError`.
- `KernelPipelineStep` has an optional `dependsOn?: string[]` field. When absent, the step depends on the previous non-skipped step (backward-compatible sequential behavior). When `[]`, the step has no dependencies and may start immediately. When `["cmd.a", "cmd.b"]`, the step waits for those commands to complete.
- `ExecuteKernelPipelineOptions` has an optional `concurrency?: number` field. Default: `Math.min(os.availableParallelism(), 8)`. When `1`, full sequential mode (ignores `dependsOn`, abort-on-failure).
- `buildSchedule` throws `ScheduleError` on forward references, missing references, duplicate command names, and circular dependencies.
- `executeScheduledSteps` runs steps concurrently up to the concurrency limit. Failed steps cause transitive dependents to be skipped with `dependencySkipped: true`. Results are sorted by `stepIndex` (declaration order).
- `KernelPipelineTimingSummary` includes both `totalDurationMs` (wall-clock) and `summedDurationMs` (sum of per-step durations). For sequential execution they are equal; for parallel execution `summedDurationMs` > `totalDurationMs`.
- `TelemetryMutex` serializes `appendStepTelemetry` calls via a promise-chain to prevent concurrent read-modify-write on the NDJSON telemetry file.
- CLI: `--concurrency N` flag on `site-kernel pipeline <name>` sets the concurrency limit.
- `pipeline.dependencies.validate` command (in `@warpgogol/site-kernel-checks`) validates all standard leaf pipelines for missing references, forward references, duplicate command names, and circular dependencies.

## Change impact (RFC-0332)

- `src/change-impact.ts` — pure classifier (`classifyPaths`), app derivation (`deriveImpactedApps`), profile recommender (`recommendProfile`), and command handler (`runChangeImpactDerive`).
- Module: `src/change-impact.module.ts` — registers `change.impact.derive`; add `changeImpactModule` to app `kernel.config.ts`.
- Advisory only — DNA-35 remains the readiness signal.

## Git-mesh (RFC-0563)

- `src/gitmesh/` — P2P replication of the platform monorepo across workshops (RFC-0562 Layer 1).
- `types.ts` — `GitMeshConfig`, `GitMeshRemote`, `GitMeshSyncResult`, `GitMeshStatus`, `GitMeshVerifyResult` interfaces.
- `config.ts` — loads `werkstatt.gitmesh.json`, validates schema, auto-creates from `.git/config` remotes in Phase 1.
- `git-ops.ts` — thin wrappers around `git` CLI: fetch, merge --ff-only, fsck, rev-parse, commit timestamp, ancestor check, remote list, signature status log.
- `sync.ts` — `gitmesh.sync` handler: fetches from all remotes, converges on highest committer timestamp, advances HEAD via `git merge --ff-only`. Pull-only — never pushes. Lock file at `.git/gitmesh.lock`.
- `status.ts` — `gitmesh.status` handler: local-only query (no network I/O). Reports local SHA, remote SHA, behind/ahead counts, last sync time.
- `verify.ts` — `gitmesh.verify` handler: verifies commit signatures against operator public key from `werkstatt.identity.json`. Incremental via `.git/gitmesh.last-verified`.
- `gitmesh-module.ts` — registers `gitmesh.sync`, `gitmesh.status`, `gitmesh.verify` workspace commands. All commands are `cacheable: false` (depend on external git/network state).
- Config file: `werkstatt.gitmesh.json` (workspace root).
- State files: `.git/gitmesh.lock` (sync lock), `.git/gitmesh.last-sync` (last sync timestamp), `.git/gitmesh.last-verified` (last verified HEAD SHA).

## SWIM (RFC-0564)

- `src/swim/` — SWIM membership and CRDT genome gossip failure detection for workshops (RFC-0562 Layer 2).
- `types.ts` — `SwimMember`, `SwimMemberStatus`, `SwimConfig`, `SwimMembershipView`, `GenomeLogEntry` interfaces.
- `config.ts` — loads `werkstatt.swim.json`, validates schema, creates config with UUID v7 `workshopId` on first `swim.join`.
- `genome-log.ts` — G-Set genome log: NDJSON append, Ed25519-signed entries via `@warpgogol/passport`, signature verification on read, set-union merge, membership view derivation, 10MB size threshold warning.
- `handlers.ts` — four command handlers with ephemeral per-command SWIM lifecycle (no daemon). `swim.join` probes seed via UDP, records `alive` event. `swim.leave` records `left` event. `swim.members` and `swim.status` read from genome log only.
- `swim-module.ts` — registers `swim.join`, `swim.leave`, `swim.members`, `swim.status` workspace commands. All `cacheable: false`.
- Config file: `werkstatt.swim.json` (workspace root, gitignored, created by `swim.join`).
- Genome log: `werkstatt.genome.log` (workspace root, gitignored, append-only NDJSON).
- Identity integration: reads `werkstatt.identity.json` for operator public key and `PASSPORT_SIGNING_KEY` env var for Ed25519 signing (RFC-0558). Fails with `identity-not-bootstrapped` if identity is not set up.
- Ephemeral lifecycle: SWIM instance is created and destroyed within each command invocation — no long-running daemon. Real-time failure detection is deferred to Phase 2.

## DHT (RFC-0565)

- `src/dht/` — S/Kademlia-hardened DHT for site registry lookups and content placement (RFC-0562 Layer 3).
- `types.ts` — re-exports DHT types and Zod schemas from `@warpgogol/ontology/operations`.
- `config.ts` — loads `werkstatt.dht.json`, validates schema, creates config with bind address, bootstrap nodes, replication factor, timeout, and cache TTL.
- `node.ts` — embedded DHT node lifecycle wrapping `@libp2p/kad-dht`: `generateSybilResistantNodeId` (PoW for open membership, identity keypair for pilot), `createDhtNode`, `startDhtNode`, `stopDhtNode`, `dhtPut`, `dhtGet`. Ephemeral per-command — no daemon.
- `cache.ts` — TTL-based DHT cache (`werkstatt.dht.cache.json`). `loadCache`, `saveCache`, `getCachedEntry`, `setCachedEntry`, `clearCachedEntry`. Cache invalidation is TTL-only (no push invalidation).
- `init.ts` — `dht.node.init` handler: creates `werkstatt.dht.json` from flags.
- `lookup.ts` — `dht.lookup` handler: queries DHT (or cache), validates entry signature, routes around dead workshops (SWIM integration seam).
- `register.ts` — `dht.register` handler: signs DHT entry with operator Ed25519 keypair, LWW conflict resolution on `lastUpdated`, invalidates cache on successful publish.
- `capacity.ts` — `dht.capacity.publish` handler: signs workshop capacity entry, publishes to DHT key `capacity/<id>`. `verifyCapacity` for signature verification.
- `placement.ts` — `dht.placement` handler: queries DHT capacity entries, selects best workshop using least-loaded, nearest, or owner-preference strategy.
- `status.ts` — `dht.status` handler: local-only status query (config, cache, identity, SWIM state). No network I/O.
- `dht-module.ts` — registers `dht.node.init`, `dht.lookup`, `dht.register`, `dht.capacity.publish`, `dht.placement`, `dht.status` workspace commands. All `cacheable: false`.
- Config file: `werkstatt.dht.json` (workspace root, gitignored, created by `dht.node.init`).
- Cache file: `werkstatt.dht.cache.json` (workspace root, gitignored).
- Identity integration: reads `werkstatt.identity.json` for operator public key and `PASSPORT_SIGNING_KEY` env var for Ed25519 signing (RFC-0558).
- Signing: DHT entries are signed using `@warpgogol/passport/dht-sign` (`dhtEntryBytes`, `signDhtEntry`, `verifyDhtEntry`).
- Ephemeral lifecycle: DHT node is created and destroyed within each command invocation — no long-running daemon.
- Dependencies: `libp2p@^3.3`, `@libp2p/kad-dht@^16.3`, `@libp2p/identify@^4.1`, `@libp2p/peer-id@^6`, `@libp2p/ping@^3.1`, `@libp2p/tcp@^11`, `@multiformats/multiaddr@^13`.

## Related packages

| Package | Role |
| --- | --- |
| `@warpgogol/site-kernel-astro` | Astro-specific path helpers for site OS commands |
| `@warpgogol/site-kernel-content` | Markdown file discovery and frontmatter parsing |
| `@warpgogol/site-kernel-integrity` | File hash tracking, build provenance, Ed25519 signing |
| `@warpgogol/site-kernel-checks` | Generic kernel command implementations shared by all Astro sites |

## Validation

- Run `pnpm --filter @warpgogol/site-kernel build:check` after API or type changes.
- Run `pnpm --filter @warpgogol/site-kernel test` when runtime, discovery, registry, or parsing behavior changes.
