---
rfcId: RFC-0557
auditId: AUDIT-RFC-0557-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0557

## Verdict: Needs revision

The RFC addresses a real gap (template/workpiece import resolvability is unprotected), but the described regex extraction pattern `from "@warpgogol/..."` / `from "@webgogol/..."` would miss dynamic `import("@webgogol/forge")` specifiers — exactly the pattern present in `kernel.config.template.ts` (the file that caused the original bug). Additionally, `packagesImpacted` lists `@warpgogol/site-kernel-handoff` with no justification, and the "read-only validators" claim is inaccurate for `template.imports.validate` when running `pnpm install --frozen-lockfile`.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **FAIL — Import extraction regex is insufficient for dynamic imports.** The RFC states (line 307): "Import extraction MUST use a regex-based static analysis approach (matching `from "@warpgogol/..."` and `from "@webgogol/..."` patterns)". However, `packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts:36-40` uses dynamic `import()`:
  ```ts
  rfc: async () => (await import("@webgogol/forge")).forgeRfcModule,
  workflow: async () => (await import("@webgogol/forge")).forgeWorkflowModule,
  compass: async () => (await import("@webgogol/forge")).forgeCompassModule,
  naming: async () => (await import("@webgogol/forge")).forgeNamingModule,
  werkstatt: async () => (await import("@webgogol/forge")).forgeWerkstattModule,
  ```
  These are `import("@webgogol/forge")` patterns, not `from "@webgogol/forge"`. The RFC's regex would produce a false negative on the exact file that caused the original `ERR_MODULE_NOT_FOUND` failure. The regex must also match `import("@warpgogol/...")` and `import("@webgogol/...")` dynamic import specifiers.

- **FAIL — "Read-only validators" claim is inaccurate.** Line 189 states: "Neither command writes or modifies any file. Both are read-only validators." However, `template.imports.validate` runs `pnpm install --frozen-lockfile` (line 103), which can modify `node_modules/` if packages are missing. While `--frozen-lockfile` prevents lockfile changes, it does install missing packages to satisfy the lockfile. The RFC should clarify that `template.imports.validate` is read-only with respect to source files but may modify `node_modules/` via the subprocess, or restrict the claim to `workpiece.imports.validate` only.

- **Pass with note — TypeScript contracts.** The `TemplateImportsValidateData` and `WorkpieceImportsValidateData` interfaces are minimal and sufficient. The `frozenLockfileError?: string` optional field is justified by the `--no-frozen-lockfile` flag.

## Axis B — DNA alignment

- **DNA-2 (pnpm workspace + Turborepo) — Pass.** The RFC enforces that root `package.json` devDependencies include every workspace package imported by templates. The body (lines 93, 109) explains how the pnpm workspace symlink chain breaks silently without this check. The `satisfies` entry is justified.

- **DNA-47 (Materialization) — Pass.** The RFC adds a pre-flight check to `SITES_BUILD_PREPARE_PIPELINE` that verifies workpiece import resolvability before `build.prepare` runs. The body (lines 97, 110) explains how this catches materialization-time resolution failures early. The `satisfies` entry is justified.

- **DNA-36 in `related[]` — Pass but weak.** DNA-36 is the `@warpgogol/site-kernel-onboarding` package invariant. The RFC's connection to DNA-36 is indirect — onboarding templates are scanned, but the RFC doesn't change the onboarding package itself. Not a failure, but the relationship is thin.

## Axis C — Ecosystem fit

- **FAIL — `packagesImpacted` includes `@warpgogol/site-kernel-handoff` without justification.** The handoff package has zero template files (verified via `find_by_name`). The RFC body never mentions any change to `site-kernel-handoff`. The implementation notes (line 306) state: "Implementation MUST live in `@warpgogol/site-kernel-checks`". `site-kernel-handoff` should be removed from `packagesImpacted`.

- **FAIL — `packagesImpacted` includes `@warpgogol/site-kernel-onboarding` misleadingly.** The onboarding package has templates that would be scanned by `template.imports.validate`, but no code changes are needed in it. `packagesImpacted` should list packages where code changes happen, not packages that are subjects of validation. If the intent is to signal "this package's templates are validated," that belongs in the RFC body, not in `packagesImpacted`.

- **Pass — Pipeline placement.** `template.imports.validate` is correctly placed in `PACKAGES_CHECK_PIPELINE` after `workspace.discovery.validate` (line 86 of `packages-check.ts`). The pipeline name and insertion point are accurate.

- **Pass with note — `workpiece.imports.validate` pipeline placement.** The RFC says "first step in `SITES_BUILD_PREPARE_PIPELINE`" (line 105, 261, 309). The current first step is `yaml.contract.lint` (RFC-0376). The RFC should address the interaction: if YAML files are invalid, `workpiece.imports.validate` might fail with a confusing error before `yaml.contract.lint` can report the real issue. Consider running after `yaml.parse.validate` (the second step) instead.

- **Missing — Compass sync.** The RFC adds commands to `PACKAGES_CHECK_PIPELINE` and `SITES_BUILD_PREPARE_PIPELINE`, which changes the pipeline surfaces. Per root AGENTS.md, `docs/ecosystem.generated.yaml` would need regeneration via `ecosystem.manifest.generate`. The RFC does not mention this.

- **Missing — AGENTS.md updates.** The RFC does not identify which `AGENTS.md` files need updates. If new commands are added to the check module, `packages/os/site-kernel-checks/AGENTS.md` or `packages/AGENTS.md` may need updates to document the new pipeline steps.

## Axis D — Forward-only compliance

No issues. The RFC introduces new commands with no backward compatibility shims, no dual paths, no deprecation of existing commands. The `commands.proposed` → `commands.added` lifecycle is correct for a draft RFC.

## Axis E — Agent-facing policy

- **Pass — Status gate.** The RFC is in `draft` status and does not contain self-authorizing language. Line 301: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

- **Pass — Implementation notes.** References to RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), and RFC-0330 (verification evidence) are correct governance references.

- **Pass — Storage policy.** No cookies, no persistence concerns. Both commands are read-only validators (with the `--frozen-lockfile` caveat noted in Axis A).

## Axis F — Pragmatism

- **FAIL — Regex approach is insufficient (same as Axis A).** The RFC correctly rejects TypeScript AST parsing (line 307: "templates are not always valid TypeScript — they contain `{{TOKEN}}` placeholders"). However, the regex must cover both static `from "@warpgogol/..."` and dynamic `import("@warpgogol/...")` patterns. The current description only covers the former.

- **Pass — Minimal command surface.** Two commands, each with a distinct purpose. `template.imports.validate` checks template files against root deps; `workpiece.imports.validate` checks generated files against root `node_modules`. Neither could be a flag on the other — they operate at different lifecycle stages.

- **Pass — `nonGoals` are meaningful.** The three non-goals (third-party peer deps, isomorphic package version compatibility, replacing pnpm install) are explicit and prevent scope creep.

## Axis G — Blind spots

- **FAIL — `workpiece.imports.validate` as first step won't validate generated files.** `SITES_BUILD_PREPARE_PIPELINE` includes generators (`kernel.wire`, `routes.generate`, `agent.routes.generate`, etc.) that CREATE files in `tools/` and `src/` with `@warpgogol/*` imports. If `workpiece.imports.validate` runs as the very first step, it validates only the materialized files from `mission.materialize`, not the files that will be generated by the pipeline. A generated file (e.g., from `agent.routes.generate`) could have an unresolvable import that won't be caught. The RFC should either: (a) run `workpiece.imports.validate` both at the start AND after generators (before `generated.files.validate`), or (b) explicitly document that only materialized files are validated and generated files are validated by the subsequent `build.check` pipeline.

- **Pass — Performance.** The RFC acknowledges ~3-5 seconds for `pnpm install --frozen-lockfile` (line 278) and notes it runs once per pipeline, not per-file.

- **Pass — False positives.** The RFC addresses unused template imports (line 277) and auto-discovery false positives (line 279) with clear mitigation reasoning.

- **Missing — Edge case: no current mission.** The RFC says `workpiece.imports.validate` fails if "the system has no current mission" (line 253). But `SITES_BUILD_PREPARE_PIPELINE` runs on every `build.prepare` invocation, including local development where a mission might not be open. The RFC should clarify how `workpiece.imports.validate` behaves when inserted into `SITES_BUILD_PREPARE_PIPELINE` but no mission is active — does it skip gracefully, or does it fail the entire pipeline?

## Questions for the author

1. How will the regex extraction handle dynamic `import("@webgogol/forge")` specifiers in `kernel.config.template.ts`? The current `from "@warpgogol/..."` pattern misses these, and this is the exact file that caused the original bug.

2. Why is `@warpgogol/site-kernel-handoff` listed in `packagesImpacted`? It has no template files and the RFC describes no changes to it.

3. Should `workpiece.imports.validate` also run after the generators in `SITES_BUILD_PREPARE_PIPELINE` (e.g., before `generated.files.validate`) to catch import issues in files created by `routes.generate`, `agent.routes.generate`, etc.?

4. How does `workpiece.imports.validate` behave when `SITES_BUILD_PREPARE_PIPELINE` runs outside a mission context (e.g., local `pnpm run build:prepare` without an open mission)? Does it skip or fail?
