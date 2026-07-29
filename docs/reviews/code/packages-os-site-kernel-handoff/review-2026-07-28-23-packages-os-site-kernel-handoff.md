---
reviewId: REVIEW-CODE-2026-07-28-01
date: 2026-07-28
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 0641293...HEAD
filesReviewed:
  - AGENTS.md
  - docs/COMMANDS.md
  - docs/architecture-dna.md
  - docs/rfcs/rfc-0574-relocate-sternsystem-storage-outside-monorepo-and-introduce-parameterized-mirror-topology.md
  - packages/ontology/src/operations/index.ts
  - packages/ontology/src/operations/sternsystem.ts
  - packages/ontology/src/tests/sternsystem-owner.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts
  - packages/os/site-kernel-handoff/src/mission/mission-abort.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/mission/mission-open.ts
  - packages/os/site-kernel-handoff/src/mission/rfc-0568-clone-reconcile.test.ts
  - packages/os/site-kernel-handoff/src/sternsystem/index.ts
  - packages/os/site-kernel-handoff/src/sternsystem/mirror-hook.ts
  - packages/os/site-kernel-handoff/src/sternsystem/mirror-validate.test.ts
  - packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts
  - packages/os/site-kernel-handoff/src/sternsystem/resolve-mirrors.test.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-list.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync-integration.test.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts
  - packages/os/site-kernel-handoff/src/surface-contract.ts
  - packages/os/site-kernel-handoff/src/tests/notausgang.test.ts
  - packages/os/site-kernel-handoff/src/tests/sternsystem-register.test.ts
  - packages/os/site-kernel-handoff/src/tests/sternsystem.test.ts
  - systems/registry.yaml
---

# Code Review: 0641293...HEAD (RFC-0574 implementation)

## Verdict: Needs revision

The diff correctly implements the core RFC-0574 mirror topology — schema migration, path resolution, star-topology sync, and documentation updates are solid. However, two validation rules from the acceptance criteria are missing in `sternsystem.validate`, and the sync logic duplicates protocol detection instead of reusing `isGitAccessible()`.

## Mechanical floor

Pass — `build:check` and all 317+46 tests pass across `@warpgogol/site-kernel-handoff` and `@warpgogol/ontology`.

## Axis A — Structural correctness

- **Duplicated protocol detection** — `sternsystem-sync.ts:119-129` inlines a protocol check (`proto.startsWith("git@") || proto.startsWith("ssh://") || ...`) that duplicates `isGitAccessible()` from `registry-io.ts:89`. The sync should use `isGitAccessible(m.path)` instead of re-implementing the same prefix list. This is a Duplicated Code smell — two code paths that must stay in sync manually.
- **`indexOf` for remote naming** — `sternsystem-sync.ts:143` uses `mirrorUrls.indexOf(mirrorUrl)` to derive the remote name. If two mirrors share the same URL, `indexOf` returns the first match for both, producing duplicate remote names. Use the loop index instead: `mirror-${i}`.

## Axis B — DNA alignment

- **Missing validation: `mirrors[0].storageType === "non-bare"`** — RFC-0574 acceptance criteria requires `sternsystem.validate` to enforce `mirrors[0].storageType === "non-bare"`. The current code at `sternsystem-validate.ts:228-234` only checks `mirrors.length < 1`. A system with `mirrors[0].storageType: "bare"` would pass validation but break the star topology (cache clone must be non-bare for `git push` to work).
- **Missing validation: `bundle` storageType not used with git protocols** — RFC-0574 acceptance criteria requires `sternsystem.validate` to enforce that `bundle` storageType mirrors do not use git protocols (`git@`, `ssh://`, `https://`). A `bundle` mirror with `path: "git@github.com:foo/bar.git"` would pass validation but `sternsystem.sync` would try to `git push` to it instead of creating a bundle.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct — all new logic is in `packages/os/site-kernel-handoff` and `packages/ontology`. AGENTS.md, COMMANDS.md, and DNA-45 are updated. The `mirror-hook.ts` deletion is clean.

## Axis D — Forward-only compliance

No issues. `repo:`/`mirror:` fields are removed from the schema in the same commit that adds `mirrors[]`. No compatibility shims or dual-paths. `mirror-hook.ts` is deleted, not kept behind a flag.

## Axis E — Agent-facing clarity

- **Compass scaffolding** — New test files (`resolve-mirrors.test.ts`, `mirror-validate.test.ts`, `sternsystem-sync-integration.test.ts`) carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. The `sternsystem-sync.ts` `CHANGE_SUMMARY` should be updated to mention RFC-0574 star topology and bundle mirror support.

## Axis F — Pragmatism

- **External mirror filter in sync** — The `externalMirrors` filter at `sternsystem-sync.ts:119-130` re-checks protocols that `resolveMirrors()` already categorizes. The sync could use `resolveMirrors()` result's `gitMirrors` (excluding `mirrors[1]` which is the bare repo) instead of re-filtering `entry.mirrors.slice(2)`.

## Axis G — Blind spots

- **Bundle cleanup race** — `sternsystem-sync.ts:179` creates a temp bundle in `os.tmpdir()`. If multiple syncs run concurrently for the same system (unlikely but possible), the `${id}-${Date.now()}.bundle` naming could collide if `Date.now()` resolves to the same millisecond. The `finally` block cleanup would then delete the other sync's bundle. Low risk but worth noting.
- **Non-file bundle mirrors** — The warning for non-file bundle protocols (`ftp`, `s3`, `rsync`) at line 192 says "bundle created at ${bundlePath}" but the `finally` block immediately deletes the bundle. The warning message is misleading — the bundle is not preserved.

## Spec compliance

| Requirement from RFC-0574 | Status | Evidence |
| --- | --- | --- |
| `mirrorEntrySchema` and `mirrorStorageTypeSchema` defined | Done | `packages/ontology/src/operations/sternsystem.ts` |
| `fleetRegistryEntrySchema` uses `mirrors: z.array(mirrorEntrySchema).min(1)` | Done | `packages/ontology/src/operations/sternsystem.ts` |
| `resolveMirrors()` helper added | Done | `registry-io.ts:109-125` |
| `sternsystem.validate` enforces `mirrors[0].storageType === "non-bare"` | **Missing** | `sternsystem-validate.ts:228-234` only checks `mirrors.length` |
| `sternsystem.validate` enforces `bundle` not used with git protocols | **Missing** | No check in `sternsystem-validate.ts` |
| `sternsystem.sync` pushes cache to bare via star topology | Done | `sternsystem-sync.ts:107-116` |
| `sternsystem.sync` creates `git bundle` for bundle mirrors | Done | `sternsystem-sync.ts:176-205` |
| `sternsystem.register` uses `--mirrors` flag | Done | `sternsystem-register.ts:147,248-254` |
| `mirror-hook.ts` deleted | Done | File removed |
| `AGENTS.md` updated | Done | `AGENTS.md:8,15-21` |
| `DNA-45` updated | Done | `docs/architecture-dna.md:197` |
| `systems/registry.yaml` migrated | Done | All entries use `mirrors[]` |

## Questions for the author

1. Why does `sternsystem.sync` inline protocol detection instead of reusing `isGitAccessible()` from `registry-io.ts`?
2. Should `sternsystem.validate` enforce `mirrors[0].storageType === "non-bare"` as a hard violation, or is the schema's `.min(1)` sufficient?
3. The non-file bundle mirror warning says "bundle created at ${bundlePath}" but the `finally` block deletes it — is this intentional?
