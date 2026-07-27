---
reviewId: REVIEW-CODE-2026-07-26-02
date: 2026-07-26
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: d7aa25099^...HEAD
filesReviewed:
  - packages/forge/bin/cli.ts
  - packages/forge/src/config/forge-config.ts
  - packages/forge/src/onboarding/init.ts
  - packages/forge/src/onboarding/upgrade.ts
  - packages/forge/src/tests/upgrade.test.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/package.json
  - packages/forge/scripts/publish-check.mjs
  - packages/forge/README.md
  - packages/forge/AGENTS.md
  - docs/rfcs/rfc-0543-npm-publication-and-consumer-upgrade-contract.md
---

# Code Review: d7aa25099^...HEAD (RFC-0543 implementation)

### Verdict: Approved

The implementation is clean, well-tested, and follows existing patterns. The code correctly implements the RFC-0543 contract: `forge.upgrade` is additive (never overwrites non-null bindings), `forge.syncedVersion` is written on init and upgrade, VERSION is sourced from `package.json` at runtime, and the `prepublishOnly` script verifies publication hygiene. One minor finding on code duplication does not block approval.

### Mechanical floor

Pass — `pnpm --filter @wgogol/forge run build:check` (0 errors), `pnpm --filter @wgogol/forge run test` (229/229 passed), `pnpm exec site-kernel run rfc.validate RFC-0543` (0 errors), `node packages/forge/scripts/publish-check.mjs` (all checks passed).

### Axis A — Structural correctness

- **Duplicated Code** (minor): `syncForgeSkills` and `syncPackSkills` in `upgrade.ts:48-145` share the same knowledge-file sync logic (frontmatter parse → knowledge array → copy files). The same pattern also exists in `init.ts:144-167` and `init.ts:188-213`. Consider extracting a shared `syncSkillWithKnowledge(srcPath, destDir, dryRun)` helper in a future refactor. Not blocking — the duplication is inherited from the existing `init.ts` pattern.
- **Unused parameter**: `addMissingBindingDefaults` in `upgrade.ts:152` accepts `workspaceRoot` but never uses it. The parameter can be removed. Minor — no functional impact.

### Axis B — DNA alignment

- **DNA-42** (Compass markup): Pass. New files `upgrade.ts` and `publish-check.mjs` both carry appropriate headers. `upgrade.ts` has `MODULE_CONTRACT` and `CHANGE_SUMMARY`. `publish-check.mjs` has a descriptive comment header.
- **DNA-54** (Forge bindings contract): Pass. The upgrade handler uses `FORGE_CLI_BINDING_DEFAULTS` and `resolvePmRunner` from the config module — no hardcoded project literals.
- No other DNA invariants are touched by this diff.

### Axis C — Ecosystem fit

- **Command lifecycle**: Pass. `forge.upgrade` is registered in `forgeCoreModule` with correct metadata (scope, flags, reads, writes, cacheable: false).
- **AGENTS.md updates**: Pass. `packages/forge/AGENTS.md` OS modules table updated with `forge.upgrade`.
- **Compass sync**: Pass. Generated artifacts (`docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, `docs/ecosystem.generated.yaml`) regenerated.
- **Import rules**: Pass. `upgrade.ts` is in `src/` and imports only from `../config/forge-config.ts`, `../registry.ts`, `../types.ts` — no `@gogol/*` imports.

### Axis D — Forward-only compliance

- No compatibility shims or dual-paths. The `VERSION` constant was replaced, not wrapped. The `prepublishOnly` script was extended, not branched. Pass.

### Axis E — Agent-facing clarity

- **Compass scaffolding**: Pass. `MODULE_CONTRACT` and `CHANGE_SUMMARY` present on `upgrade.ts`.
- **No ungrounded assertions**: Pass. Comments reference real functions (`resolveForgeRoot`, `FORGE_CLI_BINDING_DEFAULTS`, `discoverPackSkills`).
- **Readable by another agent**: Pass. Function names are descriptive (`syncForgeSkills`, `addMissingBindingDefaults`, `updateSyncedVersion`, `readForgePackageVersion`).

### Axis F — Pragmatism

- **Minimal command surface**: Pass. `forge.upgrade` earns its existence — it does something `forge.init` explicitly does not (additive sync without recreating config).
- **Existing patterns**: Pass. The skill sync logic mirrors `init.ts` exactly. The binding defaults logic uses `FORGE_CLI_BINDING_DEFAULTS` from RFC-0540.
- **Scope discipline**: Pass. The diff touches only `packages/forge/` and generated docs — no scope creep.

### Axis G — Blind spots

- **Edge cases**: Pass. The handler covers: missing `forge.yaml` (refuses with pointer to `forge.init`), unresolvable forge root (refuses with "install @wgogol/forge first"), version match (noop), null `syncedVersion` (full sync), `--dry-run` (no writes). Tests verify all these paths.
- **Interrupted operations**: The RFC states re-running `forge.upgrade` completes the sync (overwrite semantics are idempotent). The implementation supports this — skills are overwritten, `syncedVersion` is set at the end. Pass.
- **Performance**: The handler iterates `FORGE_SKILLS` (29 entries) and pack skills — negligible cost. Pass.

### Spec compliance

| Requirement from RFC-0543 | Status | Evidence |
| --- | --- | --- |
| package.json metadata complete | Done | `packages/forge/package.json:6-15` |
| VERSION sourced from package.json | Done | `packages/forge/bin/cli.ts:178-193` |
| forge.upgrade registered and syncs skills + bindings + syncedVersion | Done | `packages/forge/os/core/core.module.ts:242-265`, `packages/forge/src/onboarding/upgrade.ts:193-359` |
| forge.upgrade --dry-run writes no files | Done | `upgrade.ts:198` (isDryRun guard), test at `upgrade.test.ts:80-97` |
| forge.upgrade never overwrites non-null bindings | Done | `upgrade.ts:165-170` (null/undefined check), test at `upgrade.test.ts:120-160` |
| forge.init writes forge.syncedVersion | Done | `init.ts:96-106`, test at `upgrade.test.ts:140-146` |
| prepublishOnly verifies metadata | Done | `scripts/publish-check.mjs:1-100`, `package.json:123` |
| README documents upgrade flow | Done | `packages/forge/README.md:29-44, 57-64` |
| AGENTS.md includes forge.upgrade | Done | `packages/forge/AGENTS.md:16` |
| rfc.validate passes | Done | Verified — 0 errors |

### Questions for the author

1. The `workspaceRoot` parameter in `addMissingBindingDefaults` is unused — was it intended for a future write-back path, or can it be removed?
2. The knowledge-file sync logic is duplicated across `init.ts` and `upgrade.ts` — should a shared helper be extracted in a follow-up?
