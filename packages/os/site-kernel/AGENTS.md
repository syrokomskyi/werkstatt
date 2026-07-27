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

- The `rfc.*` command domain has migrated to `@webgogol/forge/os/rfc` (RFC-0374, RFC-0391). The former `src/rfc/` tree is deleted.
- site-kernel re-exports RFC types and handlers from `@webgogol/forge/os/rfc` in `src/index.ts` for backward-compatible imports.
- The `forgeRfcModule` is registered in `tools/kernel.config.ts` via `@webgogol/forge/os/rfc-module`.
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
- Manifest-first lifecycle validation: lifecycle handler in `@webgogol/forge/os/rfc` reads command names from `docs/command-manifest.generated.yaml` first, falls back to `listRegisteredKernelCommands` when manifest is stale.

## Command-result cache (RFC-0390)

- `src/cache/command-result-cache.ts` — command-result cache helpers: `COMMAND_RESULT_CACHE_NAMESPACE`, `COMMAND_RESULT_CACHE_SCHEMA_VERSION`, `CommandResultCacheKey`, `buildCommandResultCacheKey`, `computeInputsHash`, `computeModuleHash`, `getCachedCommandResult`, `setCachedCommandResult`. All hashing uses `@warpgogol/fingerprint` (DNA-53).
- The `command_results` namespace stores full `KernelExecutionReport` objects keyed by schema version + command name + site name + inputs hash + module hash.
- Pipeline executors (`executePipelineForSite`, `executePipelineForWorkspace`) check the cache before executing a command. On hit, the cached report is returned with `cached: true` and `durationMs: 0`. On miss, the command executes; only `ok: true` results are stored.
- `--force` flag bypasses cache reads but still writes successful results (refreshing entries). `dryRun` mode bypasses the cache entirely (no read, no write).
- `cacheable: false` on a command opts out of caching entirely — the command always executes and is never stored or retrieved from the cache.
- `computeModuleHash` is cached per-package per-pipeline-run in a `Map<string, string>` to avoid re-hashing the same `src/` directory for every command in a package.
- `command.reads.validate` (in `@warpgogol/site-kernel-checks`) enforces that every registered command declares `reads` or `cacheable: false` (CRC-01) and that `reads` patterns are valid picomatch syntax (CRC-02).

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
