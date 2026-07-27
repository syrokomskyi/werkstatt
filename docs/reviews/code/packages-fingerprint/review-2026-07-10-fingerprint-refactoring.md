---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: b5f931e75~1...b5f931e75
filesReviewed:
  - packages/fingerprint/src/primitives.ts
  - packages/fingerprint/src/semantic.ts
  - packages/fingerprint/src/fingerprint.ts
  - packages/fingerprint/src/index.ts
  - packages/fingerprint/src/types.ts
  - packages/fingerprint/src/normalizers/astro.ts
  - packages/fingerprint/src/normalizers/index.ts
  - packages/fingerprint/src/normalizers/binary.ts
  - packages/fingerprint/src/normalizers/css.ts
  - packages/fingerprint/src/normalizers/json.ts
  - packages/fingerprint/src/normalizers/jsonc.ts
  - packages/fingerprint/src/normalizers/markdown.ts
  - packages/fingerprint/src/normalizers/text.ts
  - packages/fingerprint/src/normalizers/typescript.ts
  - packages/fingerprint/src/normalizers/yaml.ts
  - packages/fingerprint/src/tests/fingerprints.test.ts
  - packages/fingerprint/package.json
  - packages/check-core/src/evidence.ts
  - packages/check-core/src/index.ts
  - packages/check-runner-node/src/index.ts
  - packages/check-runner-node/package.json
  - packages/os/site-kernel-checks/src/fingerprint-commands.ts
  - packages/os/site-kernel-handoff/src/bundle-io.ts
  - packages/os/site-kernel-integrity/src/build.ts
  - packages/os/site-kernel-integrity/src/signing.ts
  - packages/os/site-kernel-integrity/src/verify.ts
  - packages/os/site-kernel-integrity/src/run-init.ts
  - packages/os/site-kernel-integrity/src/run-update.ts
  - packages/os/site-kernel-integrity/src/move-detection.ts
---

# Code Review: b5f931e75~1...b5f931e75 (fingerprint refactoring)

## Verdict: Needs revision

The diff successfully implements all four architectural candidates (API split, wrapper deletion, Astro AST normalizer, warning emission) and the mechanical floor passes. However, DNA-42 CHANGE_SUMMARY blocks are stale in 8 modified consumer files, the `normalizers/index.ts` re-export of `byteHash` is dead code, and the `fingerprintTree` fallback metadata is semantically inaccurate.

## Mechanical floor

**Pass** — all six affected packages build clean (`tsc --noEmit`):

- `@gogol/fingerprint`, `@gogol/check-core`, `@gogol/check-runner-node`, `@gogol/site-kernel-integrity`, `@gogol/site-kernel-handoff`, `@gogol/site-kernel-checks`.

## Axis A — Structural correctness

- **Dead code** — `packages/fingerprint/src/normalizers/index.ts:67` re-exports `byteHash` from `../primitives.ts`. No file in the monorepo imports `byteHash` from `normalizers/index.ts` — the only import from this module is `normalizeFile` in `fingerprint.ts`. This re-export is unreachable and should be removed.

- **Pre-existing semantic inconsistency** — `packages/fingerprint/src/fingerprint.ts:97-102`: the `fingerprintTree` fallback sets `mode: options.mode` (which may be `"semantic"`) and `normalizer: "text"`, but the hash is computed with `byteHash`, not `normalizeText`. The metadata does not reflect the actual computation. This predates the diff but is now more visible since warnings expose the fallback path. Consider `mode: "byte"` and `normalizer: "binary"` (or a dedicated `"fallback"` label) for accuracy.

- **Typing** — `packages/fingerprint/src/normalizers/astro.ts:17`: `normalizeNode` returns `unknown`. The function builds structured objects but the return type erases their shape. A `NormalizedAstroNode` interface would improve type safety and agent navigability.

## Axis B — DNA alignment

- **DNA-42 (Compass markup)** — 8 modified consumer files have stale `CHANGE_SUMMARY` blocks that do not mention the import migration:
  - `packages/check-core/src/evidence.ts` — still says "Initial implementation as part of check-core package extraction."
  - `packages/check-runner-node/src/index.ts` — still says "Initial implementation as part of check-runner-node package extraction."
  - `packages/os/site-kernel-integrity/src/build.ts` — still says "Annotate Compass scaffolding..."
  - `packages/os/site-kernel-integrity/src/signing.ts` — still says "Annotate Compass scaffolding..." (not shown but same pattern)
  - `packages/os/site-kernel-integrity/src/verify.ts` — still says "Annotate Compass scaffolding..."
  - `packages/os/site-kernel-integrity/src/run-init.ts` — still says "Refine Compass scaffolding..."
  - `packages/os/site-kernel-integrity/src/run-update.ts` — still says "Annotate Compass scaffolding..."
  - `packages/os/site-kernel-integrity/src/move-detection.ts` — still says "Refine Compass scaffolding..."

  Each should gain a `<item>` noting the import migration from `./hash.ts` to `@gogol/fingerprint`.

- **DNA-53 (semantic fingerprint governance)** — the diff strengthens this invariant by deleting shallow wrappers and centralizing all hashing through `@gogol/fingerprint`. No violations introduced. The new `byteHashFile` primitive correctly lives in `primitives.ts`.

- **DNA-1 (monorepo boundary)** — no `apps/* → apps/*` imports. All consumer packages import from `packages/*`. Pass.

- **DNA-6 (kebab-case)** — new files `primitives.ts` and `semantic.ts` are lowercase. Pass.

## Axis C — Ecosystem fit

- **Package boundaries** — imports flow correctly: `check-core → @gogol/fingerprint`, `check-runner-node → @gogol/fingerprint`, `site-kernel-integrity → @gogol/fingerprint`, `site-kernel-handoff → @gogol/fingerprint/semantic`, `site-kernel-checks → @gogol/fingerprint/semantic`. No boundary violations.

- **Export map** — `packages/fingerprint/package.json` correctly defines `.` (primitives) and `./semantic` (semantic) export paths. Both point to `.ts` source files, consistent with the monorepo's no-build convention.

- **Dependency declaration** — `check-runner-node/package.json` correctly gains `@gogol/fingerprint` as a dependency. All other consumers already declared it.

- **Compass sync** — no `docs/*.xml` updates needed: the diff does not change repository-wide requirements, shared package contracts, or app-package relationships. It refactors an existing package's internal structure and consumer imports.

- **AGENTS.md** — no `AGENTS.md` exists in the fingerprint package. The root `AGENTS.md` does not reference internal module structure of `@gogol/fingerprint`. No update needed.

## Axis D — Forward-only compliance

- **No compatibility shims** — the deleted `hash.ts` files are not kept behind a deprecation flag. All call sites are updated in the same commit. Pass.

- **No dual-paths** — `check-core/src/index.ts` removes `export * from "./hash.ts"` cleanly. No re-export shim left behind. Pass.

- **Direct contract change** — the `package.json` exports map is changed directly, not paralleled. Pass.

## Axis E — Agent-facing clarity

- **Compass scaffolding** — new files `primitives.ts` and `semantic.ts` carry correct `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. `fingerprint.ts` and `index.ts` CHANGE_SUMMARYs are updated. Pass.

- **Stale CHANGE_SUMMARY** — the 8 consumer files listed in Axis B have CHANGE_SUMMARY blocks that no longer reflect the code. This is an agent-facing clarity gap: an agent reading `evidence.ts` would not know the import was migrated from a local wrapper to `@gogol/fingerprint`. (Also listed under DNA-42.)

- **Ungrounded assertions** — no phantom APIs or invented parameters found. All imports reference real exports. Pass.

- **Readable names** — `byteHashFile`, `normalizeNode`, `normalizeAstro` are self-documenting. Pass.

- **Log-driven development** — `fingerprintTree` warnings include file path, truncated error message, and fallback description. The warnings are also collected in the `FingerprintResult.warnings` array for programmatic access. Pass.

## Axis F — Pragmatism

- **Minimal command surface** — no new commands introduced. Pass.

- **Lean contracts** — `FingerprintResult.warnings?: string[]` is the minimum addition. `byteHashFile` is a single-purpose primitive. Pass.

- **Existing patterns** — the `@astrojs/compiler` AST parsing follows the same pattern already used in `packages/os/site-kernel-checks/src/lib/astro-parse.ts`. Pass.

- **Scope discipline** — the diff touches only the fingerprint package and its direct consumers. No scope creep. Pass.

- **Local `sha256Hex` in `check-runner-node`** — `packages/check-runner-node/src/index.ts:21-23` defines a local `sha256Hex` function that wraps `byteHash(value).slice("sha256:".length)`. This is a 1-line private utility, not a module-level wrapper. Acceptable — it avoids exporting a bare-hex helper from the public API.

## Axis G — Blind spots

- **Performance** — `normalizeAstro` is now async due to `@astrojs/compiler`'s async `parse()` API. The dispatcher `normalizeFile` already awaits it. For `fingerprintTree`, each file is processed sequentially in a for-loop. The Astro parser adds overhead per file, but this is inherent to AST-based normalization and matches the TypeScript normalizer's approach. No performance regression beyond the expected parser cost.

- **Edge cases** — `normalizeNode` in `astro.ts` falls through to `{ type: node.type }` for unrecognized node types (e.g., `doctype`, `comment`). For `comment` nodes, this correctly strips the content (semantic invariance). For `doctype` nodes, the `value` is lost — two files with different doctypes would hash identically. This is an acceptable edge case for semantic fingerprinting.

- **False positives** — the `fingerprintTree` warning emission could produce noisy output for directories with many malformed files. The warnings are capped at one per file, and the error message is truncated to 200 characters. Acceptable.

- **Migration path** — all consumers are updated in the same commit. No migration window needed. Pass.

## Spec compliance

No formal spec available — the four candidates were described in a review session. Mapping from commit message:

| Requirement | Status | Evidence |
| --- | --- | --- |
| Split public API into /primitives and /semantic | Done | `index.ts` exports primitives; `semantic.ts` exports `fingerprintFile`/`fingerprintTree`; `package.json` exports map updated |
| Delete shallow wrapper modules | Done | `check-core/src/hash.ts` and `site-kernel-integrity/src/hash.ts` deleted; all call sites updated |
| Deepen Astro normalizer to use AST | Done | `astro.ts` uses `@astrojs/compiler` `parse()` with `normalizeNode` recursion |
| Fix silent error swallowing | Done | `fingerprintTree` emits `console.warn` and collects `warnings[]` on fallback |
| Update all normalizers to import from primitives.ts | Done | All 9 normalizer files import from `../primitives.ts` |
| Green build | Done | Full `pnpm build` passed (41/41 tasks) |
| Update AGENTS/README | Done | No AGENTS.md or README.md exists in the fingerprint package |

## Questions for the author

1. Should `normalizers/index.ts:67` re-export of `byteHash` be removed? No file imports `byteHash` from that path — it appears to be a leftover from before the primitives split.

2. Should the `fingerprintTree` fallback set `mode: "byte"` and `normalizer: "binary"` instead of `mode: options.mode` and `normalizer: "text"`? The current metadata misrepresents the actual computation — a byte hash is stored under a "semantic" mode label.

3. Should the 8 consumer files with stale CHANGE_SUMMARY blocks be updated in a follow-up commit? DNA-42 requires CHANGE_SUMMARY to reflect the latest changes, but these files' blocks still describe the original implementation.
