---
rfcId: RFC-0569
auditId: AUDIT-RFC-0569-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0569

## Verdict: Needs revision

The RFC establishes a sound architectural principle (DNA-57) and correctly amends RFC-0235's dev-parity decision. However, two implementation-critical findings need resolution before implementation: the `isDevelopment` import from `astro:env` does not exist in Astro's API, and the config-loading mechanism in the dev middleware is unspecified.

## Mechanical validation (rfc.validate)

Pass — 0 violations. `rfc.validate RFC-0569 --json` returns clean.

## Axis A — Structural completeness

No issues. The RFC replaces the template's "CLI surface" / "Output format" sections with Design subsections appropriate for a non-command RFC (no new commands proposed). The TypeScript code snippet in "Dev middleware" serves as the minimal type contract. Acceptance criteria are checkable and cover the decision's scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. DNA-57 is added to `docs/architecture-dna.md` with "Established by this RFC." `satisfies: [DNA-57]` matches. `amends: [RFC-0235]` is the correct relationship — the RFC changes Open Question #4 of RFC-0235 without replacing the whole contract. RFC-0235's `amendedBy` includes RFC-0569. `related: [DNA-57, RFC-0235, RFC-0078]` are all relevant and non-decorative.

## Axis C — Ecosystem fit

**Finding (C-1) — `isDevelopment` import does not exist.** The RFC's middleware template proposes `import { isDevelopment } from "astro:env"` (RFC line 160). `astro:env` exports typed environment variables and `getSecret`, not `isDevelopment`. The standard Astro dev-mode check is `import.meta.env.DEV` or `process.env.NODE_ENV !== "production"`. The codebase already uses `process.env.NODE_ENV !== "production"` in `packages/share/src/astro/page-handler/resolve-route.ts:558` for contexts that may run outside Vite, and `import.meta.env.DEV` in `packages/share/src/dev-props-validator.ts:97`. The RFC should use one of these established patterns. The existing `astro.config.mjs` uses `process.argv.includes("dev")` for `isAstroDev`, which is also acceptable for the config file.

**Finding (C-2) — Config loading mechanism unspecified.** The RFC's middleware code snippet shows `resolveNormalizeConfig(/* ... */)` with a placeholder (RFC line 165). The existing `loadConfig()` in `packages/os/site-kernel-checks/src/text-normalize.ts:93-106` uses `loadSystemManifest()` from `@warpgogol/site-kernel-content`, which reads `system.md` via filesystem (`node:fs`). The RFC does not specify how the dev middleware loads the `text.normalize` config — whether via `loadSystemManifest()`, Astro content collections, or direct `fs.readFileSync`. This is a significant implementation gap that an implementer cannot resolve without making architectural choices.

Package boundaries are correct: `@warpgogol/share` has `astro` as a dependency, so `import type { MiddlewareHandler } from "astro"` is valid. `routes.generate` owns `src/middleware.ts` (confirmed in `packages/os/site-kernel-codegen/AGENTS.md`). `config.regenerate` owns `astro.config.mjs` (confirmed in `packages/os/site-kernel-onboarding/AGENTS.md`). `commands.changed: [routes.generate, config.regenerate]` is the correct bucket.

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path, no legacy code path maintained. The RFC amends RFC-0235 directly — it changes Open Question #4 from "No dev normalization" to "Dev normalization via middleware" without adding a parallel interpretation.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). No content authoring in acceptance criteria. No cookies or client-side storage.

## Axis F — Pragmatism

No issues. No new command — only template changes and a new export in an existing package. `createDevNormalizeMiddleware()` is minimal. `appsImpacted: [warpgogol-com]` is correct — it is the only system in `systems/registry.yaml`. `packagesImpacted` lists all three packages that need changes. `nonGoals` are explicit and meaningful (5 items, all concrete).

## Axis G — Blind spots

**Finding (G-1) — try/catch missing in code snippet.** The failure modes section says "`normalizeHtml()` throws on malformed HTML — the middleware catches errors and returns the original response body un-normalized" (RFC line 207). But the TypeScript code snippet (RFC lines 137-151) does not show a try/catch around `normalizeHtml()`. The implementation must wrap the call in try/catch to match the specified failure mode.

**Finding (G-2) — Config hot-reload in dev.** The RFC says "config loaded once at module level from system.md" (RFC line 164). In dev mode, operators edit `system.md` to toggle signals (e.g. `text.normalize.signals.dashes: false`). If the config is loaded at module level, changes to `system.md` require restarting the dev server. The RFC should address whether config is loaded per-request (simpler, slightly slower) or cached with Vite's HMR invalidation (faster, more complex).

**Finding (G-3) — Vite optimizeDeps exclusion.** `@warpgogol/share` is in the `optimizeDeps.exclude` list in `astro.config.template.mjs` (line 120). The RFC does not mention whether the dev middleware import (`@warpgogol/share/text-normalize`) works correctly with Vite's dev transform pipeline. The existing `text-normalize.ts` is server-only — this should work in SSR/dev context, but the RFC should note that the import is covered by the existing Vite config.

Performance estimate (~1-5ms per request) is reasonable for a regex tokenizer on 50-200KB pages. The `smartypants: false` change is correctly gated by `isAstroDev` and dev-only.

## Questions for the author

1. How does the dev middleware load the `text.normalize` config from `system.md`? Specify the import path and loading mechanism (e.g. `loadSystemManifest()` from `@warpgogol/site-kernel-content`, Astro content collections, or `fs.readFileSync`).
2. Should the config be loaded per-request or cached at module level? If cached, how are `system.md` edits picked up without restarting the dev server?
3. What is the correct dev-mode check for the generated middleware — `import.meta.env.DEV`, `process.env.NODE_ENV !== "production"`, or `process.argv.includes("dev")`? The RFC proposes `isDevelopment` from `astro:env` which does not exist.
