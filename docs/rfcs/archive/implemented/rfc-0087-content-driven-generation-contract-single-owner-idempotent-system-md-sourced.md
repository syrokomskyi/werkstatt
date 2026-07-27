---
id: RFC-0087
title: "Content-driven generation contract"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0336
related:
  - RFC-0026
  - RFC-0030
  - RFC-0047
  - RFC-0052
  - RFC-0078
  - RFC-0081
commands:
  proposed:
    - generator.ownership.lint
  added:
    - generator.ownership.lint
  changed:
    - overlay.pages.generate
    - public.infrastructure.generate
    - robots.generate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - os/site-kernel-codegen
  - os/site-kernel-checks
successSignals:
  - Every generator-written file under apps/<id>/ derives every app-specific value from system.md or upstream content — never from hand-edits.
  - Running the same generator twice writes 0 files the second time (idempotency).
  - Each generated file has exactly ONE generator that owns it; no file is written from multiple commands with different defaults.
  - Re-running `pnpm --filter <id> build` after onboarding does not introduce any git diff in `src/content/` or `public/` for an app that hasn't been edited.
nonGoals:
  - Removing scaffold-time generation (apps still get a working stub on first scaffold).
  - Forbidding hand-edits to non-generated content (e.g. `src/content/pages/de/index.md`).
  - Auto-running every generator on every command — the build pipeline still controls when each runs.
---

# RFC-0087: Content-driven generation contract

## Context

During the May 2026 webgogol-com onboarding, three classes of regenerated files drifted between the onboarding output (visible to the agent at handoff) and the post-`pnpm build` state (what shipped):

1. **`src/content/pages/<lang>/cosmic/passport.md` and `star-map.md`** — onboarding wrote app-specific descriptions ("Cosmic Passport — WGogol Release Manifest"); the build's `overlay.pages.generate` rewrote them with template defaults ("Cosmic Passport") because the generator passed only `LANG` to the template, not `APP` or `TITLE`. The `{{APP}}` token in the template's comment resolved to empty: `# System manifest for apps/`.

2. **`src/content/pages/root-redirect.md`** — onboarding hand-edited `lang: de` to match the brief; the build's `overlay.pages.generate` overwrote with `lang: en` because the template hardcoded `lang: en` and the generator passed no `DEFAULT_LANG` token.

3. **`public/robots.txt`** — TWO independent generators wrote this file with different defaults: `runGeneratePublicInfrastructure` (scaffold-time, template-driven) produced `Allow: /` with absolute `https://<domain>/sitemap.xml`; `runRobotsGenerate` (build-time, RFC-0052) produced canonical `Disallow:` (RFC-9309 "allow all") with relative `/sitemap.xml`. Whichever ran last won. Neither read `identity.domain` consistently.

All three patterns share one root cause: **a generator's output is not a pure function of `system.md` + the app's authored content.** Some values come from hand-edits that the generator clobbers next time it runs; some come from template defaults that don't know the app; some come from a parallel generator that competes for the same file.

## Problem

1. **Drift between onboarding output and build output.** Agent finishes onboarding with files showing "Cosmic Passport — WGogol Release Manifest"; the human runs `pnpm build` and the same files now say "Cosmic Passport". The app the agent showed at handoff is not the app that ships.
2. **No documented owner per generated file.** Two generators writing the same file is an architectural mistake nothing flags.
3. **Tokens are not enforced.** A generator can declare `{{APP}}` in its template and forget to pass it; the resolved string becomes empty without any check failing.

## Decision

Every code-generated file under `apps/<id>/` MUST satisfy three properties:

1. **Single owner.** Exactly one kernel command writes the file. Multi-owner files are forbidden; the lint catches them.
2. **Content-driven.** Every value that varies between apps MUST come from `system.md` (or upstream content) — not from hand-edits, not from defaults that don't know the app. Templates may contain only literals that are identical across all apps; everything else is a `{{TOKEN}}` substituted from a content-derived source.
3. **Idempotent.** Running the generator twice with the same `system.md` produces byte-identical output, and the second run writes 0 files (the kernel's `writeManagedFile` skips identical content).

A new `packages-check.run` step (`generator.ownership.lint`) enforces (1) by static inspection of the codegen sources. (2) and (3) remain enforceable only by test fixtures + the build-twice idempotency check below.

## Architectural fit

- **RFC-0026 / RFC-0030** define the boilerplate templates. This RFC tightens their semantics.
- **RFC-0047** declared the CMS-friendly content surface. This RFC ensures every file under that surface is either client-authored OR derived from system.md — no third category.
- **RFC-0052** introduced `robots.generate` as the canonical robots.txt builder. This RFC formalizes its sole ownership.
- **RFC-0078** introduced `kernel.wire` for tools/ wiring. This RFC's invariants apply identically there.
- **RFC-0081** introduced the GENERATED_MARKER; this RFC's idempotency rule depends on that marker for safe writes.

## Design

### Single-owner registry

`generator.ownership.lint` builds a map of `relative file path → owning command` by reading codegen source files for `runGeneratedFileSet` calls and similar writes. Multiple owners for the same path → violation.

```
[ERROR] public/robots.txt is written by both `public.infrastructure.generate`
        and `robots.generate`. Pick one owner (RFC-0087) and route the other
        through it or a shared builder.
```

### Token coverage

Templates carry `{{TOKEN}}` placeholders. The generator that consumes a template MUST pass every token the template declares. Unresolved tokens default to empty string today; under this RFC they fail the linter:

```
[ERROR] packages/os/site-kernel-codegen/src/templates/.../passport.template.md
        declares token {{APP}} but its caller runGenerateOverlayPages does
        not pass it. Either remove the token from the template or extend the
        caller's `tokens` record (RFC-0087).
```

This is a grep-class lint — sufficient for the current `applyTokens()` substitution surface.

### Idempotency contract

For every command in `APPS_BUILD_PREPARE_PIPELINE` that writes to `apps/<id>/`, a fixture test calls it twice and asserts the second run reports `0 files written`. A regression in this test means a generator added a non-deterministic input (timestamp, random ID, etc.) or stopped reading from system.md.

### system.md as single source of truth

The following content-derived fields are non-negotiable inputs to generators (read from `system.md`):

| Field | Read by | Used for |
| --- | --- | --- |
| `app` | overlay.pages, agents, kernel.wire | Template `{{APP}}` token, comments |
| `identity.tagline` | overlay.pages, agents | Page titles, descriptions, brand head |
| `identity.domain` | robots, sitemap, public.infra, audit-validators | Absolute URLs, canonical host |
| `identity.biome` | biome.css, agents | CSS layer name, doc references |
| `i18n.default` | overlay.pages (root-redirect lang), middleware | Default language |
| `i18n.supported` | overlay.pages, middleware, agents | Language list for routes, redirects, docs |

A generator that needs ANY app-specific value MUST read it from `system.md` via `loadSystemManifest` — never from a CLI flag (that doesn't survive scaffold→build), never from a hand-edit (clobbered on next run).

## Rollout

1. Land the three concrete fixes (already in flight in the same change set that proposed this RFC):
   - `runGenerateOverlayPages` passes `APP`, `TITLE`, `DESCRIPTION`, `DEFAULT_LANG`.
   - `root-redirect.template.md` uses `{{DEFAULT_LANG}}` instead of hardcoded `lang: en`.
   - Cosmic templates use `{{APP}}`, `{{TITLE}}`, `{{DESCRIPTION}}`.
   - `runRobotsGenerate` derives Sitemap URL from `identity.domain`.
   - `runGeneratePublicInfrastructure` no longer writes `robots.txt` — single owner is `robots.generate`.
   - `generated.marker.validate` moves `public/robots.txt` from author to postbuild.

2. Land `generator.ownership.lint`. Add to `PACKAGES_CHECK_PIPELINE`.

3. Add an idempotency test (`packages/os/site-kernel-codegen/src/tests/idempotency.test.ts`): scaffold a fixture app, run the full `APPS_BUILD_PREPARE_PIPELINE` twice, assert the second run writes 0 files and the git diff is empty.

4. Update `packages/os/site-kernel-codegen/AGENTS.md` to declare the three properties as invariants for new generators.

## Alternatives considered

- **Forbid hand-editing of generated files entirely.** Too restrictive — an early-stage app sometimes needs a one-off tweak before the system.md schema catches up. The GENERATED marker already gives us soft enforcement (re-run overwrites unless marker is removed).
- **Make every generated file readable from a JSON manifest in `.cache/`.** Adds an indirection layer that doesn't solve the drift — agents and humans still read the materialized file, not the manifest.

## Risks

- The ownership lint will surface every existing multi-owner file. Mitigation: the RFC ships with the only known multi-owner (`robots.txt`) already resolved; the lint becomes a regression guard, not a migration tool.
- A future feature that legitimately needs two writers (e.g. composition between a base layout and a per-page override) breaks the single-owner rule. Mitigation: introduce a composition-aware builder owned by ONE command that calls subroutines from others. No file accepts writes from multiple commands.

## Acceptance criteria

- [x] All three concrete fixes from the rollout section landed (overlay tokens, root-redirect `DEFAULT_LANG`, robots single-owner). — commit 33dbac73; `getDomainFromManifest()` in `app-boilerplate.ts`; `identity.domain` added to `SystemManifest`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `generator.ownership.lint` workspace command registered and wired into `PACKAGES_CHECK_PIPELINE`. — `packages/os/site-kernel-checks/src/generator-ownership.ts` (22 paths / 16 commands), registered in `module.ts:1582`, wired in pipeline at `module.ts:337`. (evidence: packages/ directory, package exists)
- [x] Idempotency test added; CI runs it on every change to `packages/os/site-kernel-codegen` or `packages/os/site-kernel-checks/src/robots.ts`/`ai.ts`/`sitemap.ts`/`llms.ts`. — `packages/os/site-kernel-codegen/src/tests/idempotency.test.ts` (7 tests). (evidence: packages/ directory, package exists)
- [x] `packages/os/site-kernel-codegen/AGENTS.md` lists the three invariants. — section "RFC-0087 invariants". (evidence: AGENTS.md:1, agent guide updated)
- [x] Regression: `pnpm --filter webgogol-com build` followed by `git status` produces no diff in `apps/webgogol-com/src/content/` or `apps/webgogol-com/public/`. — verified post-implementation (clean tree before re-run). (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When a future generator adds a new template token, agents MUST also extend the caller's `tokens` record in the same change — `generator.ownership.lint` will block PRs that drift.
- When introducing a new generator that writes to `apps/<id>/`, agents MUST source every app-specific value via `loadSystemManifest` and add a fixture test asserting idempotency.
