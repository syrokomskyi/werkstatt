---
rfcId: RFC-0744
auditId: AUDIT-RFC-0744-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0744

## Verdict: Needs revision

The RFC has significant command ownership overlap with RFC-0741, omits the new `@warpgogol/pbp-rate-adapters` package from `packagesImpacted`, lacks operational detail on how a Cloudflare Worker writes to site content directories, and does not address the mandatory service env-and-deploy contract (RFC-0388).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Command ownership ambiguity.** The RFC body references `rate-snapshot.resolve` as the build-time entrypoint (§CLI surface, line 222) and describes the snapshot creation flow (§4) as part of this command. However, RFC-0741 already proposes `rate-snapshot.resolve` in `commands.proposed` with the handler in `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts`. RFC-0744's `commands` frontmatter has all buckets empty (`proposed: []`, `added: []`, `changed: []`, `removed: []`). The RFC must clarify: does it own `rate-snapshot.resolve` or does RFC-0741? If RFC-0741 owns the command and RFC-0744 owns the service, the RFC must state this explicitly and list the command in `commands.changed` (since it amends RFC-0741's command definition).

- **`PbpRateSource` entity not in TypeScript contracts.** Section 3 introduces a `PbpRateSource` entity with `schema: pbp/rate-source@1`, but the TypeScript contracts section (§Design) only shows the `PbpRateSource` interface briefly (lines 261-269). The Zod schema (`pbpRateSourceSchema`) is mentioned in the file system table but not shown. The entity should have full type + schema contracts matching the pattern of RFC-0737 and RFC-0738.

- **Health endpoint not in file system table.** The health endpoint (§8) is described but `services/rate-fetcher-worker/src/health.ts` (or equivalent) is not listed in the file system responsibilities table.

- **Snapshot pruning lacks ownership.** §7 describes pruning but does not specify which command or service component performs it. Is it part of `rate-snapshot.resolve`? A separate `rate-snapshot.prune` command? The file system table has no entry for pruning logic.

- **`triggerRebuild` is unexplained.** §6 shows a `triggerRebuild()` function call but does not define its implementation. Does it call `leitstand.dev-deploy`? Does it invoke `build.prepare` directly? Does it commit to the workpiece and trigger CI? This is a critical operational detail.

## Axis B — DNA alignment

- **DNA-1 (Monorepo boundary).** The RFC correctly places adapters in `packages/pbp-rate-adapters/` and service wiring in `services/rate-fetcher-worker/`. However, the `PbpRateSource` entity lives in `packages/pbp/src/entities/rate-source.ts` — this is correct but should be explicitly stated in the architectural fit section, not just the file table.

- **DNA-49 (Fleet propagation).** The RFC claims DNA-49 satisfaction (line 211) but does not explain how the service feeds into the fleet propagation chain. "Triggers a rebuild" is not fleet propagation — the Leitstand release pipeline (`dev-deploy` → `propagate` → `promote`) is. The RFC must describe whether the rebuild triggers a `leitstand.dev-deploy`, a `release.prepare`, or something else, and how that connects to the propagation chain.

## Axis C — Ecosystem fit

- **Missing `@warpgogol/pbp-rate-adapters` in `packagesImpacted`.** The RFC creates a new package `packages/pbp-rate-adapters/` (§2, file table) but `packagesImpacted` only lists `@warpgogol/pbp` and `@warpgogol/site-kernel-checks`. The new package must be listed.

- **Missing `services/rate-fetcher-worker` in `packagesImpacted` or equivalent.** The `packagesImpacted` field is for packages, but the service workspace is a new workspace. The RFC should acknowledge that `pnpm-workspace.yaml` is impacted (new workspace entry).

- **Env-and-deploy contract (RFC-0388 / DNA-40) not addressed.** `services/AGENTS.md` requires every service that reads env vars to ship `.env.example` with `# How to obtain:` lines, deploy scripts prefixed with `deploy.preflight`, and `.env` on disk. The RFC does not mention `.env.example` or the deploy script pattern. The service will need env vars (Git API token, site workspace path, build trigger credentials) — these must be documented.

- **`services.check.run` not mentioned.** Per `services/AGENTS.md`, after adding a new service, `pnpm exec site-kernel run services.check.run` must pass. The RFC should list this in acceptance criteria.

- **`wrangler.toml` format.** The RFC shows a `wrangler.toml` example (line 152). Existing services in this monorepo do not use `wrangler.toml` — check whether the project convention is `wrangler.jsonc` or `wrangler.yaml`. The file extension should match the project standard.

## Axis D — Forward-only compliance

No issues. The RFC proposes a new service and package — no backward compatibility layers or dual-paths.

## Axis E — Agent-facing policy

- **Status gate.** The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 351). No self-authorizing language.

- **Content authoring vs code generation.** The RFC creates RateSnapshot content files programmatically — this is code-generated content, not human-authored. No anti-fabrication issue.

- **Storage policy.** The service writes to site content directories via Git API or direct write. The RFC does not introduce cookies or client-side persistence. No issue.

- **No NEEDS CLARIFICATION markers.** No unresolved markers found.

## Axis F — Pragmatism

- **`RateSourceAdapter.sourceContractRef` type mismatch.** The interface defines `sourceContractRef: string` (line 94), but `PbpRateSource` is a PBP entity with an `id` field (URI). Is `sourceContractRef` the entity ID? A `PbpEntityRef`? The type should be `PbpEntityRef` to match the PBP reference pattern used in RFC-0737 (`PbpRateSourceRef.sourceContractRef: PbpEntityRef`).

- **`RateFetchResult.sourceKind` is a literal `"external"`.** The type should be `PbpRateSnapshotSourceKind` (`"external" | "business-fixed"`) to align with RFC-0738, or the RFC should explain why adapters only handle `"external"` (they do — `business-fixed` rates come from RateSchedule, not adapters). If so, the literal is correct but should be documented.

- **ECB adapter cross-rate gap.** The ECB daily feed provides EUR reference rates (EUR as base). If the pair is USD/UAH, the adapter must compute a cross-rate. The RFC does not mention cross-rate computation. The ECB adapter section should address this.

- **Registry pattern.** The adapter registry (`registerRateSourceAdapter` / `getRateSourceAdapter`) is a simple map. This is fine for the current scope. No over-engineering.

## Axis G — Blind spots

- **Git commit from worker — critical blind spot.** §Risks mentions "Git commit from worker" but the mitigation is vague: "uses the GitHub API (or Git over SSH) to commit directly. Alternatively, the service writes to a shared store and the build pipeline pulls from it." Two completely different architectures are offered without choosing one. This is the hardest operational problem in the RFC and must be resolved before implementation. Where does the worker get a GitHub token? Which repo does it commit to? How does it handle concurrent commits?

- **Concurrent execution.** What happens if the cron trigger fires while a previous run is still in progress? Cloudflare Workers Cron Triggers do not guarantee single execution. The RFC should address deduplication or locking.

- **Empty state.** What happens on the first run when no RateSnapshot files exist? What happens when no RatePolicy entities are configured? The RFC should specify behavior.

- **Interrupted operations.** What happens if the worker crashes mid-commit (some snapshots written, others not)? Are partial commits acceptable?

- **Secret management.** The service needs credentials for Git API access and potentially for external rate APIs (ECB is free, but future adapters may need API keys). The RFC does not list required env vars or reference the `.env.example` contract.

## Questions for the author

1. **Command ownership.** Does RFC-0744 own `rate-snapshot.resolve` or does RFC-0741? If RFC-0741 owns the command handler and RFC-0744 owns the service runtime, the `commands` frontmatter must be updated and the relationship must be explicit. As written, both RFCs describe the same command with different ownership claims.

2. **Git commit architecture.** Which of the two proposed architectures (GitHub API commit vs shared store + pipeline pull) will be implemented? What credentials does the worker need, and how are they managed per the RFC-0388 env-and-deploy contract?

3. **Rebuild trigger mechanism.** What exactly does `triggerRebuild()` do? Does it call `leitstand.dev-deploy`, `release.prepare`, or something else? How does this connect to DNA-49 fleet propagation?
