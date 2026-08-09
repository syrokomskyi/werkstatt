# Audit Report: RFC-0601 — Add generated.drift.validate command for content drift in generated files

- **RFC**: RFC-0601
- **Status**: draft
- **Kind**: command
- **Scope**: workspace
- **Audit date**: 2026-07-30
- **Validator**: agent (fo-idea-audit)
- **rfc.validate**: pass (0 violations)

---

## Summary

RFC-0601 proposes a general-purpose content drift validator for text-based generated files. The concept is sound and addresses a real gap between RFC-0375 (existence) and RFC-0236 (credits-specific drift). However, the RFC has **significant ecosystem-fit issues**: its TypeScript contracts and output format diverge from the canonical `CheckResult` / `Diagnostic` types, it misrepresents the RFC-0236 implementation pattern, and it omits registration of DRIFT-01/DRIFT-02 in the diagnostic rules registry. Several blind spots around glob expansion, conditional entries, and workspace-absolute paths need resolution before planning.

---

## Axis 1: Structural completeness — ⚠️ Minor issues

| Check | Result |
| --- | --- |
| Frontmatter schema | ✅ All required fields present |
| Standard sections | ✅ Context, Problem, Decision, Architectural fit, Design, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes |
| `rfc.validate` | ✅ Pass (0 violations) |
| `commands` field | ✅ `proposed` and `added` both list `generated.drift.validate` |

### Findings

- **[S-1] `packagesImpacted` is incomplete.** The file system responsibilities table lists `packages/os/site-kernel-codegen/src/*.ts` as "Changed — add `dryRun` option to each generator function", but `packagesImpacted` only includes `@warpgogol/site-kernel-checks`. The field should also include `@warpgogol/site-kernel-codegen`.

- **[S-2] `related` list missing RFC-0602 and RFC-0603.** The body's `nonGoals` section references "RFC-0602 (deterministic rendering)" and "RFC-0603 (timestamp determinism)", but neither appears in the `related` frontmatter array. RFCs referenced in the body should be listed in `related`.

- **[S-3] `appsImpacted` is too narrow.** The command is `scope: workspace` and operates per-site via `--site`. Listing only `warpgogol-com` implies other sites are unaffected, but any site with text-based generated files will be impacted when the command is added to `build.check`. Either list all active sites or add a note that the command is workspace-wide.

---

## Axis 2: DNA alignment — ⚠️ Tenuous claim

| Check                                                   | Result           |
| ------------------------------------------------------- | ---------------- |
| `satisfies` entries exist in `docs/architecture-dna.md` | ✅ DNA-18 exists |
| DNA invariant semantics match RFC scope                 | ⚠️ See finding   |

### Findings

- **[D-1] DNA-18 claim is a stretch.** DNA-18 states: "Uni registry is the single UI index — `uni.registry.yaml` is deterministically generated, validated by `uni.registry.validate`, and drift between registry and manifests fails `build.check`." RFC-0601 extends the _spirit_ of this invariant (deterministic generation + drift detection) to all generated files, not just the Uni registry. The RFC's architectural fit section acknowledges this ("Extends the determinism principle"), but strictly speaking, DNA-18 is about the registry index, not general file drift. Consider: (a) acknowledging in the architectural fit section that this RFC extends the _pattern_ of DNA-18 without strictly satisfying it, or (b) proposing a new DNA invariant for generated-file determinism in a separate RFC.

---

## Axis 3: Ecosystem fit — 🔴 Critical issues

| Check                                       | Result                                           |
| ------------------------------------------- | ------------------------------------------------ |
| TypeScript contracts match canonical types  | 🔴 `rule` vs `ruleId`                            |
| Output format matches `CheckResult`         | 🔴 `violations[]`/`notices[]` vs `diagnostics[]` |
| Rule IDs registered in diagnostics registry | 🔴 DRIFT-01, DRIFT-02 not registered             |
| Referenced patterns accurately described    | 🔴 RFC-0236 dryRun claim is inaccurate           |
| Pipeline integration specified              | ⚠️ Position in `build.check` not specified       |

### Findings

- **[E-1] 🔴 `DriftDiagnostic` contract uses `rule` instead of `ruleId`.** The canonical `Diagnostic` interface at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel/src/types.ts:184` uses `ruleId: string`. The RFC's TypeScript contract at line 143 uses `rule: "DRIFT-01"`. This is a field name mismatch with the canonical type system. The RFC should use `ruleId` to match `Diagnostic`.

- **[E-2] 🔴 Output format diverges from `CheckResult`.** The canonical `CheckResult` at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel/src/types.ts:208` has a single `diagnostics: Diagnostic[]` array. The RFC's output format (lines 175-196) introduces `violations[]` and `notices[]` as separate arrays. The acceptance criteria (line 235) says "`--json` output follows standard `CheckResult` shape with `violations[]` and `notices[]`" — but `CheckResult` does not have `violations` or `notices` fields. DRIFT-01 should be an error-severity `Diagnostic`, and DRIFT-02 should be an info-severity `Diagnostic`, both in the same `diagnostics[]` array.

- **[E-3] 🔴 DRIFT-01 and DRIFT-02 not registered in diagnostic rules registry.** All rule IDs must be registered via `rule()` in `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`. The RFC does not mention registering these rules. Without registration, `diagnostic.shape.lint` (DSL-02) will flag them as unregistered ruleIds. The file system responsibilities table should include adding DRIFT-01 and DRIFT-02 to the rules registry.

- **[E-4] 🔴 RFC-0236 dryRun claim is factually incorrect.** The RFC states (line 160): "This is the same pattern used by `material.credits.drift.validate` (RFC-0236)." However, examining the actual implementation at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/material-credits.ts:560`, `runMaterialCreditsDriftValidate` does NOT use a `dryRun` option on the generator. Instead, it calls `renderMaterialCreditProse()` directly — a pure render function that returns a string without writing to disk. The generator function (`material.credits.generate`) does not have a `dryRun` parameter. The RFC should either: (a) correct the claim to say "inspired by the pattern in RFC-0236, which uses a separable render function" and describe the actual mechanism, or (b) propose a different mechanism (a `dryRun` flag on each generator's handler) and acknowledge that this is a new pattern, not an existing one.

- **[E-5] ⚠️ `packagesImpacted` missing `@warpgogol/site-kernel-codegen`.** See [S-1]. The file system responsibilities table changes `packages/os/site-kernel-codegen/src/*.ts` but the frontmatter doesn't list this package.

- **[E-6] ⚠️ Pipeline position in `build.check` not specified.** The RFC says to add the command to `build.check` (line 170) but doesn't specify where. Looking at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/pipelines/build-check.ts`, the pipeline runs `SITES_CHECK_AUTHOR_PIPELINE` first, then additional validators. Should `generated.drift.validate` run before or after `generated.marker.validate` (which is in `SITES_CHECK_POSTBUILD_PIPELINE` with `--phase=postbuild`)? The RFC should specify the position.

---

## Axis 4: Forward-only compliance — ✅ Clean

| Check                     | Result                                          |
| ------------------------- | ----------------------------------------------- |
| No supersedes/amends      | ✅ New command                                  |
| `versionBump` appropriate | ✅ `patch` — new validator, no breaking changes |
| No DNA invariant changes  | ✅ Satisfies existing DNA-18 (tenuously)        |

### Findings

- **[F-1] ⚠️ Scope of `dryRun` changes is understated.** The RFC says "Each generator must support a `dryRun: true` option" (line 160). This is a cross-workspace change affecting potentially dozens of generator functions in `packages/os/site-kernel-codegen/src/*.ts`. The gradual adoption (DRIFT-02 notice) mitigates the rollout risk, but the RFC should acknowledge the total scope: how many generators exist, and what is the expected effort per generator? The implementation notes say "start by adding `dryRun` to the simplest generators" but don't estimate the total number.

---

## Axis 5: Agent-facing policy — ⚠️ Unclear mechanism

| Check                        | Result                                        |
| ---------------------------- | --------------------------------------------- |
| Implementation notes present | ✅ Clear "MAY/MUST" rules                     |
| Status gate enforced         | ✅ "MAY implement ONLY when status: accepted" |
| dryRun opt-in default        | ✅ "MUST be opt-in (default `false`)"         |

### Findings

- **[Q-1] ⚠️ dryRun invocation mechanism is unspecified.** The RFC says "Re-invoke the generator's render function in dry-run mode" (line 154) but doesn't specify how. Options: (a) call the generator's command handler with a `--dry-run` flag and inspect `filesModified` / capture in-memory output, (b) import the generator's render function directly and call it with `dryRun: true`, (c) use the existing `KernelRuntimeContext.dryRun` flag. The mechanism matters because it determines the implementation shape. The RFC should specify which approach is expected.

- **[Q-2] ⚠️ How does `generated.drift.validate` access individual generator render functions?** The ownership map maps file paths to command names (e.g., `humans.generate`), but command handlers are registered in command tables, not exported as individual render functions. The RFC should clarify whether generators need to export their render functions separately, or whether the validator calls the full command handler with `dryRun` and inspects the output.

---

## Axis 6: Pragmatism — ⚠️ Missing implementation details

| Check                                  | Result            |
| -------------------------------------- | ----------------- |
| Binary file detection mechanism        | ⚠️ Not specified  |
| Git-tracking detection mechanism       | ⚠️ Not specified  |
| Performance estimate                   | ⚠️ Not quantified |
| Generator render function separability | ⚠️ Not addressed  |

### Findings

- **[P-1] ⚠️ Binary file detection mechanism unspecified.** The algorithm says "skip binary entries like PNG, ICO, WebP, MP4, WebM" (line 153) but doesn't specify how. Is it file extension-based? Content-based (magic bytes)? The `GENERATOR_OWNERSHIP_MAP` doesn't have a "binary" flag on entries. The RFC should specify extension-based filtering with an explicit list of skipped extensions.

- **[P-2] ⚠️ Git-tracking detection mechanism unspecified.** The algorithm says "Files that are not git-tracked are skipped" (line 156) but doesn't specify how to determine git-tracking status. RFC-0600 explicitly says "via `git ls-files`". RFC-0601 should do the same.

- **[P-3] ⚠️ Performance not quantified.** The risks section says "Re-rendering all text-based generated files in memory could be slow" but doesn't estimate how many files or how long. A typical site might have 30-50 text-based generated files. The RFC should estimate the per-file re-rendering cost and total to justify the "not in build.prepare" decision.

- **[P-4] ⚠️ Generator render function separability not addressed.** Many generators in the codebase are monolithic — they read source data, render content, and write files in a single handler function. Separating the render step from the write step for every generator is a significant refactoring effort. The RFC should acknowledge this and specify whether generators need to export a separate `render*()` function (like `renderMaterialCreditProse`) or whether the `dryRun` flag on the handler is sufficient.

---

## Axis 7: Blind spots — 🔴 Critical gaps

### Findings

- **[B-1] 🔴 Glob pattern and placeholder expansion not addressed.** The `GENERATOR_OWNERSHIP_MAP` has entries with placeholders like `{lang}`, `{route}`, `{app}`, `{id}`, `{system}` and glob patterns like `public/_img/**/*.webp`. The RFC's algorithm doesn't address how to expand these to concrete file paths. This is non-trivial — it requires resolving site languages, routes, and app IDs. The RFC should specify the expansion mechanism or limit the initial scope to non-glob entries.

- **[B-2] 🔴 Conditional entries not addressed.** The ownership map has entries with `conditional: true` (e.g., `cms.schema.generate` outputs). `generated.files.validate` skips these. The RFC should specify whether `generated.drift.validate` also skips conditional entries.

- **[B-3] 🔴 Workspace-absolute paths not addressed.** Some ownership map entries are workspace-absolute (e.g., `packages/ui/src/sections/{id}/{id}.types.generated.ts`). These don't live under a site's `public/` or `src/` directory. The RFC says "scope is strictly the site's public/ and src/ directories" (nonGoals, line 64) but doesn't address workspace-absolute generated files. Should they be skipped? Included with a different path resolution?

- **[B-4] ⚠️ Interaction with RFC-0604 (pipeline completeness) not addressed.** RFC-0600 mentions that some generated files (bordbuch, cosmic-passport-key) are not in `build.prepare` — they're produced by separate commands. If `generated.drift.validate` checks these files, they might always show as "drifted" because they were never regenerated by `build.prepare`. The RFC should clarify whether it only checks files produced by `build.prepare` or all files in the ownership map.

- **[B-5] ⚠️ dryRun output fidelity not addressed.** If a generator's `dryRun` mode produces different output than its normal mode (e.g., skips a timestamp field, omits a cache-dependent section), the drift check is invalid — it would produce false positives. The RFC should require that `dryRun` mode produces byte-identical output to normal mode, and should specify how to verify this property.

---

## Open questions for the operator

1. **[Q-E-4]** Should the RFC correct the RFC-0236 dryRun claim, or propose a different mechanism? The actual RFC-0236 implementation uses a separable pure render function, not a `dryRun` flag on the generator handler. Which pattern should RFC-0601 adopt?

2. **[Q-E-2]** Should the output format use the canonical `CheckResult` with `diagnostics[]` (DRIFT-01 as error, DRIFT-02 as info), or does the operator want the separate `violations[]`/`notices[]` shape? The canonical pattern is `diagnostics[]`.

3. **[Q-B-1]** Should the initial implementation scope be limited to non-glob, non-conditional, site-relative entries? Or should it handle all entry types from the start?

4. **[Q-D-1]** Is the DNA-18 satisfaction claim acceptable, or should a new DNA invariant be proposed for generated-file determinism?

---

## Summary table

| Axis                       | Severity     | Count |
| -------------------------- | ------------ | ----- |
| 1. Structural completeness | Minor        | 3     |
| 2. DNA alignment           | Minor        | 1     |
| 3. Ecosystem fit           | **Critical** | 6     |
| 4. Forward-only compliance | Clean        | 1     |
| 5. Agent-facing policy     | Minor        | 2     |
| 6. Pragmatism              | Minor        | 4     |
| 7. Blind spots             | **Critical** | 5     |

**Total findings: 22** (6 critical, 16 minor)

**Recommendation:** Address critical findings (E-1, E-2, E-3, E-4, B-1, B-2, B-3) before proceeding to enhance. The ecosystem-fit issues (type contract, output format, rule registration, factual accuracy) and blind spots (glob expansion, conditional entries, workspace-absolute paths) need resolution to produce an implementation-ready RFC.
