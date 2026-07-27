# @gogol/site-kernel-onboarding Agent Guide

Apply this guide when working in `packages/os/site-kernel-onboarding/**`.

## Purpose

This package owns the onboarding-time kernel surface: the brief contract, the deterministic input synthesis (`onboarding.synthesize`), the scaffold templates (consumed by `mission.materialize`), and the deterministic biome-token derivation. It is the only package allowed to read from `onboarding/<system-id>/.input/` and to write synthesis artifacts to `onboarding/<system-id>/.output/`.

## Commands registered here

| Command | RFC | Purpose |
| --- | --- | --- |
| `onboarding.synthesize` | RFC-0532 | Validate and hash raw client materials from `onboarding/<system-id>/.input/` and write a deterministic input manifest to `onboarding/<system-id>/.output/input-manifest.json`. |
| `amend.input.validate` | RFC-0135 | Validate an amend batch against the RFC-0135 contract. |
| `amend.system.merge` | RFC-0135 | Additively merge an amend batch's site-plan-delta into the system's system.md. |
| `amend.delta.files` | RFC-0139 | Resolve the repo-relative file set an amend batch is responsible for. |
| `content.coverage.delta` | RFC-0135 | Maintain the cumulative coverage ledger for an amend batch. |
| `amend.atoms.merge` | RFC-0135 | Plan the merge of a strengthen source into an existing page. |
| `amend.provenance.append` | RFC-0135 | Append an immutable provenance record per amend batch. |
| `amend.provenance.validate` | RFC-0135 | Verify the amend provenance trail. |
| `biome.tokens.derive` | RFC-0071 | Deterministic OKLCH palette derivation from `axes.yaml`. |
| `biome.site-background.derive` | RFC-0114 | Derive the siteBackground block from biome axes only. |
| `config.regenerate` | RFC-0078 | Re-apply root config templates to an existing system. |
| `config.template.sync` | RFC-0137 | Propagate dependency versions from a reference system into canonical templates. |

## Brief contract (00-brief.md)

The brief is the only hand-authored file in `onboarding/<system-id>/.input/`. Five frontmatter fields are required (see `src/brief.ts` `BriefFrontmatter`):

- `client.id` — kebab-case (regex `^[a-z][a-z0-9-]{2,48}$`), becomes the Sternsystem id.
- `client.domain` — bare FQDN, no protocol.
- `i18n.default` — ISO 639-1 (e.g. `de`).
- `i18n.supported` — array of ISO 639-1; MUST contain `i18n.default`.
- `legalJurisdiction` — ISO 3166-1 alpha-2 (e.g. `DE`).

`onboarding.synthesize` validates the brief via `parseBriefFrontmatter` from `src/brief.ts` and cross-checks against `systems/registry.yaml` for existing system identity.

**NEVER carry biome / family / constellation / passport / deploy / growth decisions in the brief.** Those are derived in AI synthesis (orchestrated by the `onboard` skill) or are ecosystem invariants (passport is always on).

## Templates

Boilerplate templates live under `src/templates/` mirroring the target system path (RFC-0078 generation-first discipline). Token syntax: `{{TOKEN}}` literal replacement at runtime. Add new templates as files, not as inline strings in generator code.

- For generated TypeScript app surfaces, keep local relative imports aligned with the owning generator/runtime contract; do not copy the package-source `.ts` rule or the legacy `.js` rule blindly across surfaces.
- Apply import-style changes in the template or generator source, never by editing generated system files directly.
- Scaffold templates are consumed by `mission.materialize` (RFC-0389), not by a standalone scaffold command. Generated runtime route files are owned by `@gogol/site-kernel-codegen` `runGenerateRoutes`, not by onboarding-local duplicate templates.
- If a scaffolded system route must change, update the canonical route template in `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro` and regenerate via `routes.generate`; do not add or maintain a second catch-all route template here.

## Template placeholder format

- All template files in `src/templates/` must use the `{{TOKEN_NAME}}` placeholder format.
- Token substitution is handled by `applyTokens()` which replaces `{{\s*(\w+)\s*}}` patterns.
- Do not use custom placeholder formats like `app-name` or other ad-hoc patterns.
- Token names should be UPPER_CASE with underscores (e.g., `{{CLIENT_ID}}`, `{{DEFAULT_LANG}}`, `{{DOMAIN}}`).

## Rules for agents

- Treat `onboarding/<system-id>/.input/**` as read-only.
- Never hand-edit files under `onboarding/<system-id>/.output/**`; regenerate via the owning command.
- Never write `system.yaml` (legacy, removed by RFC-0077).
- Never bypass brief validation — always use `parseBriefFrontmatter` from `src/brief.ts`.
- When onboarding or amending file-based Markdown sources from `onboarding/<system-id>/.input/**`, preserve source Markdown formatting semantics. In particular, keep hard line breaks authored as trailing double spaces (`  `) instead of normalizing them away during synthesis, atomization, merge planning, coverage bookkeeping, or final content authoring.
- New phase enum entries require a coordinated change in the owning command, `app.qa.validate`, and an RFC.
