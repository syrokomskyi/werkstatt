---
rfcId: RFC-0382
auditId: AUDIT-RFC-0382-01
date: 2026-07-14
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0382

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has a concrete omission on Axis B: it declares `satisfies: [DNA-53]` and uses `@gogol/fingerprint` for content hashing, but does not list `@gogol/fingerprint` in `packagesImpacted` and does not mention adding it as a dependency in the rollout. Additionally, the SQLite schema is missing a `schema_version` column that the Risks section references as a mitigation. These are fixable without restructuring the RFC.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec site-kernel run rfc.validate RFC-0382 --json` returns 0 violations (validated 2026-07-14).

## Axis A — Structural completeness

- **Decision** is present tense and single: "The kernel gains a two-phase acceleration." ✓
- **CLI surface** shows exact invocations with flags and scope. ✓
- **TypeScript contracts** are minimal type signatures. ✓
- **File system responsibilities** table names concrete paths. ✓
- **Output format** documents `--json` shape for both new commands. ✓
- **Failure modes** specifies behavior for manifest missing/stale, better-sqlite3 unavailable, corrupt DB, `--force-cache-refresh`. ✓
- **Rollout** describes default behavior, adoption path, and future extension. ✓
- **Alternatives considered** has 5 real alternatives with rejection reasons. ✓
- **Risks** includes native module compatibility, cache staleness, manifest drift, schema evolution. ✓
- **Acceptance criteria** items are checkable and cover both phases. ✓
- **Implementation notes** are explicit behavioral rules. ✓

**Finding A-1 (minor):** The Risks section references "schema version column in `cache_entries`" as a mitigation for schema evolution, but the SQLite schema in the Design section does not include a `schema_version` column. The schema and the risk mitigation are inconsistent.

**Finding A-2 (minor):** The Risks section does not mention agent misinterpretation risk — agents may assume the cache is always active and not notice the silent no-op fallback, leading to confusion when commands are slow despite the "cache" being in place.

## Axis B — DNA alignment

- `satisfies: [DNA-53]` — DNA-53 ("Semantic fingerprint governance") requires all project hashes to use `@gogol/fingerprint`, forbidding ad hoc `createHash`. The RFC body explicitly states: "Cache invalidation is per-file via mtime + content hash computed through `@gogol/fingerprint` (DNA-53), not ad hoc `createHash`." The RFC enforces DNA-53 by using the package for content hashing. ✓
- `related: [RFC-0266, RFC-0331]` — RFC-0266 (command manifest) is directly reused in Phase 1. RFC-0331 (DNA-trace) commands benefit from Phase 2. Both are relevant. ✓
- No conflicts with existing DNA invariants. ✓

**Finding B-1 (failure):** `@gogol/fingerprint` is not currently a dependency of `@gogol/site-kernel` (checked `packages/os/site-kernel/package.json` — dependencies are `@gogol/observability`, `@gogol/share`, `@gogol/site-kernel-content`, `tsx`, `yaml`). The RFC uses `@gogol/fingerprint` for content hashing but does not mention adding it as a dependency in the Rollout section or File system responsibilities table. `packagesImpacted` lists only `@gogol/site-kernel` but should also list `@gogol/fingerprint` since a new dependency relationship is being established.

## Axis C — Ecosystem fit

- **Package boundaries:** Cache code lives in `packages/os/site-kernel/src/cache/`. Imports flow from site-kernel to `@gogol/fingerprint`. ✓
- **Pipeline placement:** No new pipeline checks. `kernel.cache.status` and `kernel.cache.clear` are standalone workspace commands. ✓
- **Compass sync:** The RFC does not change repository-wide requirements or shared package contracts. No `docs/*.xml` sync needed. ✓
- **AGENTS.md updates:** Acceptance criteria mention "AGENTS.md updated with cache layer notes if agent behavior changes." The RFC is workspace-scoped; this would be root `AGENTS.md`. ✓
- **Cosmic naming:** N/A — no manifests or component/section/page contracts.
- **Command lifecycle:** `commands.proposed` has 2 new commands; `commands.changed` lists 6 existing commands. Internally consistent. ✓

**Finding C-1 (minor):** The RFC does not mention Compass scaffolding (DNA-42) for the new source files in `packages/os/site-kernel/src/cache/`. Non-trivial new source files must carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. The implementation plan should include this.

## Axis D — Forward-only compliance

- No compatibility shims or dual-paths. The manifest-first fallback to `listRegisteredKernelCommands` is a safety mechanism for stale manifests, not a legacy compatibility layer — it ensures correctness, not backward compatibility. ✓
- No deprecation. ✓
- No legacy code paths maintained behind a flag. `--force-cache-refresh` is an operational escape hatch, not a feature flag. ✓

**Finding D-1 (minor):** The RFC does not address whether the `listRegisteredKernelCommands` fallback in Phase 1 should eventually be removed once the manifest is reliably generated in CI. The fallback keeps the old slow path alive indefinitely. Consider documenting a future removal path.

## Axis E — Agent-facing policy

- **Status gate:** No self-authorizing language. Implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓
- **Implementation notes** reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). ✓ RFC-0230 (agent surface) is N/A — the RFC does not change agent surface contracts.
- **Anti-fabrication:** No content authoring in acceptance criteria. N/A.
- **Storage policy:** The SQLite cache is a CLI/build-time local cache, not client-side or server-side web app persistence. The AGENTS.md storage policy ("Client-side persistence: localStorage only; server-side: unstorage") applies to web apps, not CLI tools. ✓

**Finding E-1 (minor):** The RFC should explicitly state that the SQLite cache is a local build-time/CLI tool cache, not runtime web app persistence, to avoid confusion with the storage policy in AGENTS.md.

## Axis F — Pragmatism

- **Minimal command surface:** `kernel.cache.status` (diagnostics) and `kernel.cache.clear` (escape hatch) each earn their existence. ✓
- **Lean contracts:** TypeScript types are minimal. ✓
- **Existing patterns:** The RFC reuses the existing command manifest (Phase 1) and considers file-based cache before choosing SQLite (alternatives). ✓
- **Scope discipline:** `appsImpacted: []` is correct. `nonGoals` are explicit and meaningful. ✓

**Finding F-1 (minor):** The `CacheLayer` interface declares an `invalidate(namespace, key)` method, but no described flow uses it. Cache invalidation is described as automatic (mtime + hash mismatch on next read), not explicit. If `invalidate` is not needed, remove it to avoid speculative generality.

## Axis G — Blind spots

- **Performance:** Baseline measurements and target times are included. ✓
- **Edge cases:** Corrupt DB, missing dependency, manifest stale are addressed. ✓

**Finding G-1 (minor):** The RFC does not specify the cold cache fill time — the first run with an empty SQLite DB must parse all 367 files, compute SHA-256 hashes, and write 367 rows. This one-time cost should be documented as an acceptance criterion or at least estimated.

**Finding G-2 (minor):** The RFC does not address concurrent execution — two agents running `rfc.validate` simultaneously could both try to write to the same SQLite DB. SQLite has WAL mode and its own locking, but the RFC should mention the concurrency strategy (e.g., WAL mode, busy timeout, or process-level lock).

**Finding G-3 (minor):** The RFC introduces `better-sqlite3` as an optional dependency but does not mention supply chain considerations (audit, known vulnerabilities). Since it's optional and falls back gracefully, this is low risk, but worth noting.

## Questions for the author

1. The SQLite schema in the Design section is missing the `schema_version` column that the Risks section references as a mitigation for schema evolution. Should the column be added to the schema, or should the risk mitigation be reworded?
2. `@gogol/fingerprint` is not currently a dependency of `@gogol/site-kernel`. Should `packagesImpacted` include `@gogol/fingerprint`, and should the Rollout section mention adding it as a dependency?
3. What is the concurrency strategy for the SQLite cache when multiple agents or processes access `.cache/kernel-cache.db` simultaneously — WAL mode, busy timeout, or a process-level lock?
