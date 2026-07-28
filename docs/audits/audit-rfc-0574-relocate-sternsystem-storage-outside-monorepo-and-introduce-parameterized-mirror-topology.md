---
rfcId: RFC-0574
auditId: AUDIT-RFC-0574-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0574

## Verdict: Needs revision

The RFC has a fundamental forward-only violation (dual-schema migration period with `repo:`/`mirror:` fallback) and significantly undercounts the affected call sites (13+ files vs 5 listed). The `bundle` storageType with non-git protocols introduces speculative complexity without identifying implementation dependencies. DNA-45 contract change is not properly declared as an amendment to RFC-0354.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-30 (warning):** `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not true. The RFC modifies `fleetRegistryEntrySchema` (an external surface export from `packages/ontology/src/operations/sternsystem.ts`). If this RFC modifies `packages/ontology/src/external-surfaces/`, declare `breaksC: true` (RFC-0480).

## Axis A — Structural completeness

- **File system responsibilities table is incomplete.** The RFC lists 5 files in the table (`mission-materialize.ts`, `mission-materialization-commands.ts`, `sternsystem-sync.ts`, `sternsystem-validate.ts`, `registry-io.ts`). A grep for `path.join(workspaceRoot, "systems"` reveals **13+ files** with hardcoded `systems/<id>/` path references that would need updating:

  - `sternsystem/sternsystem-register.ts` — 5 call sites (lines 89, 116, 123, 130, 260)
  - `sternsystem/sternsystem-pin.ts` — line 63
  - `sternsystem/sternsystem-status.ts` — line 98
  - `sternsystem/sternsystem-extract.ts` — line 81
  - `mission/mission-open.ts` — lines 85, 144
  - `mission/mission-close.ts` — line 187
  - `mission/mission-abort.ts` — line 138
  - `notausgang/notausgang-commands.ts` — lines 205, 212
  - `surface-contract.ts` — line 50
  - `mission/rfc-0568-clone-reconcile.test.ts` — 6 test references

  The RFC's risks section mentions "Missing any call site breaks mission lifecycle silently" but does not enumerate these files. The `resolveMirrors()` helper centralizes resolution, but every call site must be updated to use it.

- **`commands.changed` is incomplete.** The RFC lists 4 changed commands (`sternsystem.sync`, `sternsystem.validate`, `mission.materialize`, `mission.reconcile`). At least 5 additional commands have hardcoded `systems/<id>/` paths and must be updated: `sternsystem.register`, `sternsystem.pin`, `sternsystem.status`, `sternsystem.extract`, `mission.open`, `mission.close`, `mission.abort`, `notausgang.export`.

## Axis B — DNA alignment

- **DNA-45 contract change not declared as amendment.** DNA-45 explicitly lists `repo` and `mirror` as registry fields: "Each entry carries: `id`, `cosmicStar`, `repo`, `mirror`, `pinnedPlatform`, `currentMission`, `lastRelease`, `status`, `registeredAt`, and `deployment` config." The RFC replaces `repo`/`mirror` with `mirrors[]`, fundamentally changing DNA-45's contract. However, `amends: []` is empty. The RFC should declare `amends: [RFC-0354]` (the establishing RFC for DNA-45) or `supersedes: [RFC-0354]` if the intent is to replace the original contract entirely.

- **DNA-45 text update not mentioned.** DNA-45's prose in `docs/architecture-dna.md` (line 197) lists `repo` and `mirror` as fields. The RFC's rollout does not include updating the DNA-45 entry to reflect the new `mirrors[]` field. The `satisfies: [DNA-45]` claim is inconsistent with the actual contract change.

- **`related[]` includes RFC-0354 but `amends[]` is empty.** The RFC is in `related: [RFC-0354]` but the relationship is not merely "related" — it directly modifies the contract established by RFC-0354. This should be in `amends`.

## Axis C — Ecosystem fit

- **`sternsystem.register` not listed in `commands.changed`.** The current `sternsystem.register` code (`sternsystem-register.ts:243-255`) constructs registry entries with `repo` and `mirror` fields. The RFC says "New Sternsystems registered via `sternsystem.register` use `mirrors[]` from day one" but does not list `sternsystem.register` in `commands.changed`. The command's `--repo` and `--mirror` flags must change to `--mirrors` or similar.

- **Compass sync not addressed.** The RFC changes repository-wide registry schema and storage topology but does not identify which `docs/*.xml` files need synchronization. `docs/requirements.xml` and `docs/technology.xml` likely reference the fleet registry schema.

- **AGENTS.md updates partially identified.** The RFC correctly identifies the AGENTS.md rule update (line 228: "Agents MUST NEVER edit any Sternsystem mirror directly"). But the RFC also needs to update the "Monorepo layout" section (line 8) which says "Each Sternsystem has a git repo (referenced by `repo:` in the registry)" and the "External mirror sync" section (lines 15-20) which describes the single `mirror` field. These sections are not mentioned in the rollout.

## Axis D — Forward-only compliance

- **MAJOR: Dual-schema migration period violates forward-only discipline.** The RFC explicitly proposes keeping `repo:` and `mirror:` as deprecated optional fields during migration (rollout step 1: "Keep `repo:` and `mirror:` as deprecated optional fields during migration") and fallback logic (step 2: "fall back to `repo:`/`mirror:` when only legacy fields exist"). The "No flag day" section (line 331-333) describes a dual-schema period. This directly violates the forward-only principle: "no backward compatibility layers, no shims, no dual-paths. Legacy code paths are deleted, not maintained behind a flag." The migration should be atomic: convert all entries in a single change, remove `repo:`/`mirror:` from the schema, and delete fallback logic.

## Axis E — Agent-facing policy

- **V-30 warning: `breaksC` not declared.** The RFC modifies `fleetRegistryEntrySchema` exported from `@warpgogol/ontology/operations`. This is an external surface change. The RFC should either declare `breaksC: true` or clarify that `fleetRegistryEntrySchema` is not in `packages/ontology/src/external-surfaces/`.

- **Status gate is clean.** The RFC does not contain self-authorizing language. Implementation notes correctly reference governance rules (RFC-0224, RFC-0330, RFC-0334).

## Axis F — Pragmatism

- **`bundle` storageType with non-git protocols is speculative.** The RFC introduces `storageType: bundle` for FTP, S3, and rsync protocols but does not identify any packages or libraries for implementing these protocols. `packagesImpacted` lists only `@warpgogol/ontology` and `@warpgogol/site-kernel-handoff` — no FTP/S3/rsync client packages. The current use case (single GitHub mirror) does not require non-git protocols. This adds schema complexity and validation rules (`mirror-bundle-git-protocol`) for a need that doesn't exist yet.

- **`mirrorEntrySchema` is too lean for protocol inference.** The schema has only `path` and `storageType` — no explicit `protocol` field. Protocol is inferred from the `path` string heuristically. The RFC acknowledges this in "Protocol inference ambiguity" but the validation rule `mirror-bundle-git-protocol` depends on the heuristic being correct. An explicit `protocol` field would be more robust and testable.

- **`resolveMirrors()` return type is speculative.** `MirrorResolution` has `gitMirrors` and `backupMirrors` arrays, but the current use case only needs `cachePath`. The split into git vs. backup mirrors is only relevant if `bundle` storageType is implemented, which is speculative.

## Axis G — Blind spots

- **`syncCacheClone` interaction with new topology is unclear.** Currently, `syncCacheClone` (`mission-materialize.ts:277-367`) fetches from `entry.repo` (the bare repo) into `systems/<id>/` (the cache clone). In the new topology, `mirrors[0]` IS the cache clone. The RFC says `mission.materialize` "resolves cache clone from `mirrors[0].path`" but doesn't explain what `syncCacheClone` does now. Does it fetch from `mirrors[1]` (the bare repo)? Does it skip fetching entirely since `mirrors[0]` is already the cache? The current `syncCacheClone` logic (fetch + reset to origin/branch) assumes the cache clone has an `origin` remote pointing to the bare repo. In the new topology, does `mirrors[0]` still have an `origin` remote?

- **Post-receive hook conflict.** The `nonGoals` say "Does not modify the mirror auto-push hook (post-receive) — the hook remains on bare mirrors." But the star topology changes sync flow: `sternsystem.sync` now pushes from cache to all mirrors, including bare mirrors. When the cache pushes to a bare mirror, the bare mirror's post-receive hook fires and pushes to... the external mirror? But `sternsystem.sync` already handles that. This creates a double-push. The RFC should address whether the hook should be removed or modified in the new topology.

- **`systems-git/` directory fate unclear.** The migration moves `systems/<id>/` to `../systems-cache/` (mirrors[0]). But the existing bare repos at `systems-git/<id>` (referenced by `entry.repo`) — are they kept as `mirrors[1]`? The migration example suggests yes, but the RFC doesn't explicitly say what happens to the `systems-git/` directory or the `local:` prefix convention used in `resolveRepoPath()`.

- **`sternsystem.validate` performance.** The new validation rules check that `mirrors[0].path` exists on disk. For each system in the registry, this is a filesystem `existsSync` call. With N systems and M mirrors, this is N×M filesystem checks. The RFC should note the cost, though it's likely negligible for the current fleet size.

- **Concurrent sync and materialize.** If `sternsystem.sync` is pushing from cache to mirrors while `mission.materialize` is fetching into cache, there's a potential race condition. The RFC doesn't address locking for mirror synchronization. The current `sternsystem.sync` doesn't acquire a system lock, but the star topology makes the cache clone a shared resource for both sync and materialize.

## Questions for the author

1. **Forward-only violation:** The dual-schema migration period with `repo:`/`mirror:` fallback directly violates the forward-only discipline. Why not convert all registry entries atomically in a single commit, removing `repo:`/`mirror:` from the schema immediately? What prevents a one-shot migration given there's only one entry in `systems/registry.yaml`?

2. **DNA-45 amendment:** DNA-45 explicitly lists `repo` and `mirror` as fields. Replacing them with `mirrors[]` is a contract change, not an extension. Should this RFC `amends: [RFC-0354]` or `supersedes: [RFC-0354]`? And should the DNA-45 prose in `docs/architecture-dna.md` be updated as part of this RFC's rollout?

3. **`syncCacheClone` in new topology:** In the new topology, `mirrors[0]` IS the cache clone. What does `syncCacheClone` do now? Does it still fetch from a bare mirror (`mirrors[1]`)? Does `mirrors[0]` have an `origin` remote? Or is `syncCacheClone` removed entirely since the cache clone is now a first-class mirror, not a derived artifact?

4. **`bundle` storageType necessity:** Is there a concrete current need for FTP/S3/rsync backup mirrors, or is this speculative generality? Would it be simpler to support only git-accessible mirrors (`non-bare` and `bare` storageTypes) and defer `bundle` to a future RFC when a concrete backup requirement exists?

5. **Post-receive hook:** In the star topology, `sternsystem.sync` pushes from cache to all mirrors. When it pushes to a bare mirror that has a post-receive auto-push hook, the hook fires and pushes to the external mirror — but `sternsystem.sync` already handles that push. Is this a double-push conflict? Should the hook be removed from bare mirrors in the new topology?
