---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 0436a090...HEAD
filesReviewed:
  - packages/werkstatt/src/mission/operator-config-files.ts
  - packages/werkstatt/src/mission/operator-config-files.test.ts
  - packages/werkstatt/src/mission/materialize-config-validate.ts
  - packages/werkstatt/src/mission/materialize-config-validate.test.ts
  - packages/werkstatt/src/mission/mission-close.ts
  - packages/werkstatt/src/mission/mission-materialize.ts
  - packages/werkstatt/src/mission/mission.module.ts
  - packages/werkstatt/src/mission/index.ts
  - packages/werkstatt-site/src/checks/pipelines/packages-check.ts
  - docs/architecture-dna.md
  - docs/rfcs/rfc-0840-preserve-root-level-config-files-during-materialization.md
  - packages/werkstatt/AGENTS.md
---

# Code Review: 0436a090...HEAD (RFC-0840 implementation)

### Verdict: Needs revision

The implementation is structurally sound and follows the established RFC-0822 env-persist pattern correctly. However, there are dead code findings and a missing `content.config.ts` boilerplate exemption that should be fixed before stamping.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` and `pnpm --filter @warpgogol/werkstatt-site run build:check` both pass. 13 unit tests pass (7 + 6). `rfc.validate` passes. `dna.registry.validate` passes.

### Axis A — Structural correctness

- **Dead code: `isBoilerplateDir` and `isDataPath` functions are never called.** `materialize-config-validate.ts:91-93` defines `isBoilerplateDir` and `:99-101` defines `isDataPath`, but neither is referenced anywhere in the file. The root-level scan at `:130-143` only iterates files (`entry.isFile()`), skipping directories implicitly. These functions should be removed.
- **Dead code: `isEnvFile` function is never called.** `materialize-config-validate.ts:83-85` defines `isEnvFile` but it is not used in the scan loop. The env file check is missing from the root-level scan — `.env` files would be flagged as unrecognized. This is both dead code and a bug (missing exemption).

### Axis B — DNA alignment

- **DNA-71 alignment: Pass.** The implementation matches the revised DNA-71 description: path-based `OPERATOR_CONFIG_FILES`, persist/restore pattern, `materialize.config.validate` in `PACKAGES_CHECK_PIPELINE`.
- **DNA-44 (data-only contract): Pass.** Operator config files are untracked, not git-committed.
- **DNA-64 (stack-agnostic): Pass.** `operator-config-files.ts` has no `@warpgogol/*` imports. `materialize-config-validate.ts` imports only from `@warpgogol/werkstatt/kernel` (self-import) and `../sternsystem/registry-io.ts` (internal).

### Axis C — Ecosystem fit

- **Pipeline placement: Pass.** `materialize.config.validate` is correctly placed in `PACKAGES_CHECK_PIPELINE` (workspace-scope), not `SITES_CHECK_PIPELINE` (site-scope). This resolves the audit's C-1 finding.
- **Command registration: Pass.** Registered in `mission.module.ts` with `scope: "workspace"`, `supportsAllSites: true`, `cacheable: false`.
- **AGENTS.md update: Pass.** `packages/werkstatt/AGENTS.md` updated with operator config file persistence section.
- **Ecosystem manifest: Pass.** `ecosystem.manifest.generate` ran and updated `docs/ecosystem.generated.yaml`.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-path logic, no legacy code maintained.

### Axis E — Agent-facing clarity

- **MODULE_CONTRACT and CHANGE_SUMMARY: Pass.** All new files (`operator-config-files.ts`, `materialize-config-validate.ts`) have proper headers. Test files also have headers.
- **No ungrounded assertions: Pass.** Comments reference real functions and files.
- **Readable: Pass.** Function names are clear (`persistOperatorConfigFiles`, `restoreOperatorConfigFiles`, `runMaterializeConfigValidate`).

### Axis F — Pragmatism

- **Dead functions reduce pragmatism.** `isBoilerplateDir`, `isDataPath`, `isEnvFile` add noise without value. Remove them or wire them in.
- **`content.config.ts` missing from boilerplate.** `GENERATED_PATTERNS` includes `/^content\.config\.ts$/` as generated, but `content.config.ts` is an Astro boilerplate file present in every workpiece. It should be in `BOILERPLATE_FILES` or the generated pattern is sufficient (it is — the generated pattern catches it). However, `content.config.ts` is NOT generated — it is a static Astro config file. The generated pattern is wrong here; it should be in boilerplate.

### Axis G — Blind spots

- **MAT-CONFIG-01 false positive risk: `content.config.ts`** — currently caught by `GENERATED_PATTERNS` but it is not a generated file. It is a static Astro boilerplate file. This is a misclassification that could cause confusion. Move to `BOILERPLATE_FILES`.
- **MAT-CONFIG-01 false positive risk: `.env*` files** — `.env` files are not exempted in the root-level scan. Every workpiece with `.env` would emit a warning. This is a bug — `.env*` files are handled by RFC-0822 and should be exempt.
- **Edge case: empty missions directory.** Pass — `existsSync(missionsDir)` check at `:111` handles this.
- **Edge case: `missions/archive/` directory.** Pass — explicitly skipped at `:116`.

### Spec compliance

| Requirement from RFC-0840 | Status | Evidence |
| --- | --- | --- |
| `OPERATOR_CONFIG_FILES` constant | Done | `operator-config-files.ts:26-29` |
| `persistOperatorConfigFiles` | Done | `operator-config-files.ts:31-49` |
| `restoreOperatorConfigFiles` | Done | `operator-config-files.ts:51-69` |
| `mission.close` wiring | Done | `mission-close.ts:748-767` |
| `mission.materialize` wiring | Done | `mission-materialize.ts:1188-1207` |
| `materialize.config.validate` command | Done | `mission.module.ts:406-415` |
| `PACKAGES_CHECK_PIPELINE` wiring | Done | `packages-check.ts:202-203` |
| Unit tests | Done | 13 tests, all pass |
| DNA-71 updated | Done | `docs/architecture-dna.md:291-293` |
| `rfc.validate` passes | Done | Exit code 0 |
| Deviation: `SITES_CHECK_PIPELINE` → `PACKAGES_CHECK_PIPELINE` | Done | Documented in acceptance criteria |
| Deviation: `OPERATOR_CONFIG_FILES` list revised | Done | 2 files instead of 4, path-based |

### Questions for the author

1. Why are `isBoilerplateDir`, `isDataPath`, and `isEnvFile` defined but never called? Remove them or wire them into the scan logic.
2. Why is `.env*` not exempted in the MAT-CONFIG-01 root-level scan? Every workpiece with `.env` would emit a false warning.
3. Why is `content.config.ts` classified as generated (`GENERATED_PATTERNS`) when it is a static Astro boilerplate file? Move to `BOILERPLATE_FILES`.
