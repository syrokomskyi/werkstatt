---
rfcId: RFC-0371
auditId: AUDIT-RFC-0371-01
date: 2026-07-09
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0371

## Verdict: Needs revision

The RFC makes a sound architectural decision — replacing the custom copy-to-public font pipeline with idiomatic Fontsource CSS imports is correct and well-justified. However, it has a critical ecosystem-fit gap: the biome Zod schema is `.strict()` and does not allow a `fonts` field, so adding `fonts:` to biome YAMLs will fail `biome.contract.validate` unless the schema is updated in the same wave. Additionally, 3 of 4 validation rules in `fonts.contract.validate` are author-time checks misplaced in the postbuild pipeline, and the `commands.added` frontmatter is populated despite the RFC being draft.

## Mechanical validation (rfc.validate)

Pass — zero violations. `rfc.validate RFC-0371 --json` returns `status: "pass"`, `violations: []`.

## Axis A — Structural completeness

- **Onboarding template package misidentified.** Phase 5 (line 287) says "update `packages/os/site-kernel-onboarding` templates so new apps scaffold with `fonts.imports.css`." But the onboarding templates contain no font-related scaffolding — the `global.template.css` that imports `fonts.generated.css` lives in `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css` (verified: line 39, `@import "./fonts.generated.css";`). The RFC should name `packages/os/site-kernel-codegen` as the template owner, not `packages/os/site-kernel-onboarding`.
- **License check absent from failure modes table.** The "License compliance" section (lines 267-274) describes a 5th validation: reading the `license` field from `@fontsource/*/package.json` and failing if not in the approved set. But the "Failure modes" table (lines 256-264) lists only 4 rules. The acceptance criteria (line 312) list the license check as a separate item. The failure modes table should include the license rule for completeness.
- **AGENTS.md target unspecified.** Line 271 says "AGENTS.md is updated with a 'Font licensing' section" but does not specify which AGENTS.md file (root, `apps/`, `packages/`). Since this is a cross-workspace font policy, the root `AGENTS.md` is the likely target, but the RFC should be explicit.

## Axis B — DNA alignment

- **DNA-50 alignment is valid.** `satisfies: [DNA-50]` (Notausgang export) is justified: fonts become NPM dependencies resolved from `package.json` rather than committed woff2 binaries, making the export smaller and self-documenting (lines 93, 57). This is a genuine enforcement of the Notausgang principle.
- **DNA-50 in both `satisfies` and `related`.** DNA-50 appears in `satisfies: [DNA-50]` (line 33) and `related: [DNA-50, ...]` (line 26). This is redundant — `satisfies` is the authoritative list for DNA invariants the RFC implements; `related` should list non-satisfies references. Minor.

## Axis C — Ecosystem fit

- **CRITICAL — Biome schema does not allow `fonts` field.** `biomeSchema` in `@/packages/ontology/src/schemas/biome.ts:245-269` is `.strict()` and has no `fonts` key. Adding `fonts:` to any biome YAML (as the RFC proposes in lines 105-129) will cause `biome.contract.validate` (which runs in `APPS_CHECK_AUTHOR_PIPELINE`, line 23 of `apps-check-author.ts`) to reject the biome with an unexpected-key error. The RFC lists `packages/ontology` in `packagesImpacted` but never describes updating the Zod schema. This must be added to the Design section and acceptance criteria.
- **Pipeline placement — 3 of 4 rules are author-time, not postbuild.** The RFC says "replace `fonts.selfhost.validate` with `fonts.contract.validate` in `APPS_CHECK_POSTBUILD_PIPELINE`" (line 279). But only `external-font-origin` (scans `dist/**/*.html`) is a postbuild check. The other three rules scan authored source:
  - `font-binary-in-public` — scans `apps/*/public/**` (author-time)
  - `no-fontsource-import` — scans `apps/*/src/styles/**/*.css` (author-time)
  - `fontsource-package-missing` — checks `package.json` (author-time)

  These belong in `APPS_CHECK_AUTHOR_PIPELINE` (or `APPS_CHECK_PIPELINE`), not postbuild. Running them after `astro build` means font binaries in `public/` have already been copied to `dist/` and the build has already failed on missing CSS imports. The RFC should either split the command (author-time rules in author pipeline, `external-font-origin` in postbuild) or move the whole command to the author pipeline and keep only the dist scan as a separate postbuild step.

- **`commands.added` populated for a draft RFC.** Both `proposed` and `added` list `fonts.imports.generate` and `fonts.contract.validate` (lines 35-40). The repo convention (verified across all draft RFCs: RFC-0367, RFC-0315, RFC-0308, RFC-0292, etc.) is that draft RFCs have `proposed: [list]` and `added: []`. `added` should be empty until implementation.
- **`packagesImpacted` includes unjustified entries.** `packages/ui` (line 50) and `packages/tokens` (line 51) are listed, but the RFC body describes no changes to either. `packages/ui` is mentioned only as a rejected alternative for dependency placement (line 224). `packages/tokens` is not mentioned anywhere in the RFC body. These should be removed or the RFC should describe the actual changes to these packages.
- **Compass sync not identified.** The RFC changes the biome contract (adding `fonts` section) and shared package contracts, which per root AGENTS.md Compass document duties requires synchronization of `docs/*.xml` files. The RFC does not identify which Compass files need updating.

## Axis D — Forward-only compliance

No issues. The RFC is cleanly forward-only:

- Old commands (`fonts.generate`, `fonts.selfhost.validate`), the `SELF_HOSTED_FONTS` registry, `public/fonts/` directory, and `fonts.generated.css` are all removed in the same wave (lines 42-44, 284-286).
- No compatibility shim, no dual-path, no grace period.
- Legacy code paths are deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues.

- **Status gate**: Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 327). No self-authorizing language.
- **Governance references**: RFC-0224 (accepted→implemented transition, line 328) and RFC-0334 (supersede escalation, line 334) are correctly referenced.
- **Anti-fabrication**: No content authoring claims — all acceptance criteria are code/config changes an agent can make.
- **Storage policy**: No cookies or persistence introduced.

## Axis F — Pragmatism

- **`packagesImpacted` scope discipline** — see Axis C. `packages/ui` and `packages/tokens` are listed but not impacted.
- **Two commands earn their existence**: `fonts.imports.generate` (generator) and `fonts.contract.validate` (validator) follow the established `*.generate` / `*.validate` pattern. No command duplicates an existing command's scope.
- **Biome-driven font discovery** reuses the existing biome YAML as the single source of truth rather than creating a new font registry — good. But the RFC must also update the biome Zod schema (see Axis C critical finding).
- **`nonGoals` are explicit and meaningful** — no variable fonts, no subsetting, no runtime font-loading JS, no typographic design changes.

## Axis G — Blind spots

- **New app empty state.** The `no-fontsource-import` rule fails if no `@fontsource/*` import exists in `apps/*/src/styles/**/*.css`. A newly scaffolded app (before font configuration) would fail this check. The RFC says Phase 5 updates onboarding templates, but as noted in Axis A, the actual template is in `site-kernel-codegen`, and the RFC doesn't describe what the scaffolded `fonts.imports.css` would contain for a new app. The RFC should specify that the onboarding scaffold seeds a default `fonts.imports.css` with at least one import (e.g., Inter).
- **`nonprofit-trust` mono family not self-hosted.** The biome declares `monoFamily: "'JetBrains Mono', 'Courier New', monospace"` (line 57 of `nonprofit-trust.yaml`), but `JetBrains Mono` is not in the RFC's proposed `fonts` section for that biome (lines 120-128, which list only Inter and Lora). This is the current behavior (not in `SELF_HOSTED_FONTS` either), so it's not a regression — but the RFC's claim that "the biome YAML fonts section is the single source of truth" for font selection (line 56, success signal) is inaccurate if some `typography.*Family` fonts are intentionally system-fallback. The RFC should clarify that `fonts` lists only self-hosted Fontsource packages, and fonts relying on system fallbacks need not appear.
- **Migration atomicity.** The 6-phase rollout (lines 278-288) is forward-only, but the RFC doesn't clarify that all phases must happen in one implementation wave. If Phase 2 (new commands) lands before Phase 4 (old commands removed), both `fonts.generate` and `fonts.imports.generate` would exist simultaneously — a temporary dual-path. The RFC should state that implementation is atomic.
- **License file distribution.** Acknowledged in Risks (line 305) and deferred to a future RFC. Acceptable for a draft.
- **Performance.** File scans are lightweight (same scope as existing `fonts.selfhost.validate`). No bottleneck concern.

## Questions for the author

1. The biome Zod schema (`biomeSchema` in `packages/ontology/src/schemas/biome.ts`) is `.strict()` with no `fonts` field. Where in the Design section is the schema update described, and what is the `BiomeFontEntry` Zod definition that will be added to `biomeSchema`?
2. Three of four `fonts.contract.validate` rules scan authored source (`public/`, `src/styles/`, `package.json`), not `dist/`. Should these rules run in `APPS_CHECK_AUTHOR_PIPELINE` instead of `APPS_CHECK_POSTBUILD_PIPELINE`, or should the command be split?
3. The `global.template.css` that imports `fonts.generated.css` lives in `packages/os/site-kernel-codegen`, not `packages/os/site-kernel-onboarding`. Should Phase 5 reference `site-kernel-codegen` as the template owner, and what should the scaffolded `fonts.imports.css` contain for a new app to pass `no-fontsource-import` on first build?
