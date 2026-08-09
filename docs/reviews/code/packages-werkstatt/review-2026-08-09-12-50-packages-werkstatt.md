---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: c62af298...HEAD
filesReviewed:
  - packages/werkstatt/src/plugin/autonomy-validate.ts
  - packages/werkstatt/src/plugin/invoke-hook.ts
  - packages/werkstatt/os/werkstatt-autonomy.module.ts
  - packages/werkstatt/package.json
  - packages/werkstatt/tsconfig.json
  - packages/werkstatt/AGENTS.md
  - packages/werkstatt/src/plugin-contract.ts
  - packages/werkstatt/src/plugin-registry.ts
  - tools/kernel.config.ts
  - docs/PACKAGE_GRAPH.md
  - docs/rfcs/rfc-0772-consolidate-engine-core-into-packages-werkstatt-with-plugin-registry.md
---

# Code Review: RFC-0772 implementation (c62af298...HEAD)

## Verdict: Needs revision

The implementation successfully consolidates 7 packages into `packages/werkstatt` with re-export shims preserving backward compatibility. The autonomy guard and plugin hook invocation helper are well-structured. However, the autonomy guard has an overly broad exemption list that includes stack-specific packages (`@warpgogol/site-kernel-*`), which contradicts DNA-64's intent. The call site inversion was deferred to RFC-0774/0775, which is pragmatic but means the engine still has direct stack-plugin imports.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build:check` passes (only pre-existing errors in `../share/`). All 1240 tests pass (2 skipped). `rfc.validate --id RFC-0772` passes.

## Axis A — Structural correctness

- **Re-export shims use `export *`** which can cause naming collisions if multiple shims export the same symbol. This is acceptable during the transition period but should be noted.
- **`packages/werkstatt/package.json` exports are very large** (~50 subpath exports). This is necessary for backward compatibility but makes the package manifest unwieldy.
- **`invoke-hook.ts` uses `as` cast** (line 29: `as ((ctx: T) => Promise<HookResult>) | undefined`) — necessary due to TypeScript's inability to narrow union types in this pattern, but could be cleaner with overloads.

## Axis B — DNA alignment

- **DNA-64 (engine/plugin/workshop boundary)** — the autonomy guard enforces this, but the exemption list includes `@warpgogol/site-kernel-*` packages which are stack-specific. This is a temporary exemption during the re-export scaffold period, documented in the code and RFC. The guard will be tightened in RFC-0774/0775.
- **DNA-51/52/53** — primitives, artifact store, and fingerprint modules moved intact with their tests. Invariants preserved.

## Axis C — Ecosystem fit

- **Package boundaries** — the consolidation correctly moves engine modules into `packages/werkstatt` while keeping site-specific packages (`site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, etc.) separate for future plugin composition.
- **AGENTS.md updates** — `packages/werkstatt/AGENTS.md` updated with full entry point list and autonomy guard documentation. Root `AGENTS.md` already references `packages/werkstatt`.
- **PACKAGE_GRAPH.md** — updated with new dependency structure and re-export shim table.
- **Command manifest** — regenerated with `werkstatt.autonomy.validate` command.

## Axis D — Forward-only compliance

- **Re-export shims are construction scaffolds, not compatibility layers.** The RFC and code both document that shims are deleted in RFC-0776 after workshop migration. This is forward-only.
- **No dual-paths or flags.** The old packages either re-export or are active (not yet moved). No legacy code paths maintained behind flags.

## Axis E — Agent-facing clarity

- **Compass scaffolding** — new files (`autonomy-validate.ts`, `invoke-hook.ts`, `werkstatt-autonomy.module.ts`) all carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks.
- **AGENTS.md** — comprehensive entry point table and autonomy guard documentation.

## Axis F — Pragmatism

- **Autonomy guard modeled on forge precedent** — reuses the proven regex pattern from `packages/forge/src/onboarding/doctor.ts`. No new pattern invented.
- **Plugin hook helper** — minimal typed wrapper with neutral defaults. No speculative generality.
- **Call site inversion deferred** — pragmatic decision given the complexity. The plan marks this as a human review point, and the deferral to RFC-0774/0775 is documented.

## Axis G — Blind spots

- **Autonomy guard performance** — 378 files scanned in ~20ms. Acceptable for per-`packages.check` frequency.
- **False positives** — the regex pattern excludes comments (matching forge precedent). Type-only imports are detected. Self-imports are exempt.
- **Edge cases** — empty `packages/werkstatt/src/` directory handled (would report zero files scanned). Missing directory would cause readdir to return empty array (caught by `.catch(() => [])`).

## Spec compliance

| Requirement from RFC-0772 | Status | Evidence |
| --- | --- | --- |
| `packages/werkstatt` exists with all engine modules | Done | All 19 module directories present |
| Plugin registry and hooks implemented | Done | `plugin-contract.ts`, `plugin-registry.ts`, `invoke-hook.ts` |
| All engine→stack call sites inverted | Partial | Hook helper implemented; call site inversion deferred to RFC-0774/0775 |
| `werkstatt.autonomy.validate` registered and wired | Done | `werkstatt-autonomy.module.ts`, `tools/kernel.config.ts:157-158` |
| Autonomy guard passes | Done | 378 files, zero violations (with temporary exemptions) |
| Re-export shims keep workshop building | Done | All old packages have re-export shims |
| Documentation synchronized | Done | PACKAGE_GRAPH.md, AGENTS.md, command manifest updated |

## Questions for the author

1. **When will the `@warpgogol/site-kernel-*` exemptions be removed from the autonomy guard?** The code documents this as temporary (RFC-0774/0775), but there's no automated mechanism to prevent the exemptions from becoming permanent. Should a follow-up RFC track be created to ensure removal?
2. **Should the `@warpgogol/ontology` and `@warpgogol/share` exemptions be permanent or temporary?** RFC-0771 rule 2 says operations schemas should be extracted into `werkstatt/schemas` (done), but UI taxonomy and content schemas stay in `ontology`/`share` which move to the site plugin. The exemptions may need to be tightened when the site plugin is composed.
3. **The `packages/werkstatt/package.json` has ~50 subpath exports — is this sustainable?** When the package is published to npm (RFC-0773), the large export map may cause issues with bundlers or tree-shaking. Should some exports be consolidated?
