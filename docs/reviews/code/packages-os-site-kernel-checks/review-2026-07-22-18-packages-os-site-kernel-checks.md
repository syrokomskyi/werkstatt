---
reviewId: REVIEW-CODE-2026-07-22-01
date: 2026-07-22
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 4210d3004...HEAD
filesReviewed:
  - packages/ontology/src/schemas/system/manifest.ts
  - packages/os/site-kernel-content/src/system-manifest.ts
  - packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts
  - packages/os/site-kernel-codegen/src/app-boilerplate.ts
  - packages/os/site-kernel-codegen/src/templates/app-boilerplate/public/_redirects.template
  - packages/os/site-kernel-checks/src/b2b-model.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts
  - docs/COMMANDS.md
  - docs/ecosystem.generated.yaml
---

# Code Review: 4210d3004...HEAD (RFC-0487 platform implementation, Steps 1-4)

### Verdict: Approved

The diff implements the platform-side of RFC-0487 (retiredRoutes + businessModel schema fields, 410 codegen, b2b.model.validate command) cleanly and idiomatically. All four impacted packages pass type checks. No DNA violations, no backward compatibility layers, no agent-facing clarity gaps. Two minor findings on Axis G (edge cases) are worth addressing but do not block.

### Mechanical floor

Pass — `@gogol/ontology`, `@gogol/site-kernel-content`, `@gogol/site-kernel-codegen`, `@gogol/site-kernel-checks` all pass `build:check`. `rfc.validate RFC-0487` passes.

### Axis A — Structural correctness

No issues. The `b2b-model.ts` validator follows the existing `footer-legal.ts` pattern (parseFrontmatter, collectMarkdownFiles, violation accumulation, exit code 1 on violations). The `buildRetiredPageRoutesBlock` function is a pure extension alongside `buildRetiredSurfaceRedirectBlock` — no duplicated logic, just a new function for a new concern. The `SystemManifest` interface in `site-kernel-content` mirrors the Zod schema in `@gogol/ontology` — both gained `retiredRoutes` and `businessModel` fields with consistent types.

### Axis B — DNA alignment

No issues.

- **DNA-4** (canonical content): `retiredRoutes` and `businessModel` are content-declared fields in `system.md`, not hardcoded in code. The codegen reads them from the manifest.
- **DNA-13** (disabled content must not leak): `b2b.model.validate` directly enforces this — checks that removed B2C page IDs, route slugs, and navigation labels don't leak.
- **DNA-42** (Compass markup): `b2b-model.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding.

### Axis C — Ecosystem fit

No issues.

- **Package boundaries**: imports flow correctly — `site-kernel-codegen` imports from `site-kernel-content` (type only), `site-kernel-checks` imports from `site-kernel` and `site-kernel-astro`.
- **Pipeline placement**: `b2b.model.validate` is placed in `sites-check-author` after `content.references.validate` — correct position for an author-time content validator.
- **Command lifecycle**: command is registered in `commands.proposed` in RFC frontmatter, added to command table, wired into pipeline, and `docs/COMMANDS.md` + `docs/ecosystem.generated.yaml` are regenerated.
- **AGENTS.md**: the `site-kernel-checks/AGENTS.md` command table is a curated subset, not exhaustive — no update needed for a single new command.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no deprecation grace periods. The `retiredRoutes` field is a new declarative mechanism — the codegen reads it directly, no fallback to hardcoded entries.

### Axis E — Agent-facing clarity

No issues. `b2b-model.ts` has clear `MODULE_CONTRACT` with purpose and non-goals. Rule IDs (B2B-PAGE-01, B2B-ROUTE-01, etc.) are documented in the RFC and used consistently in the code. The no-op behavior when `businessModel` is absent is clearly documented in the command description and the code.

### Axis F — Pragmatism

No issues. `b2b.model.validate` is a new command, not a flag on `system.manifest.validate` — justified by the RFC because it checks cross-cutting content semantics (prose, navigation, labels) beyond manifest structure. The scan scope is documented (~40-60 files for webgogol-com). The `buildRetiredPageRoutesBlock` function is minimal — 18 lines, single responsibility.

### Axis G — Blind spots

**Minor finding 1 — `b2b-model.ts` B2B-LABEL-01 false positive risk:** The navigation check matches `semanticTarget.pageId` entries, which is correct per the RFC. However, if a navigation entry uses a different structure (e.g., `href` instead of `semanticTarget`), it would be silently skipped. This is acceptable for the current navigation schema but worth noting if the navigation schema evolves.

**Minor finding 2 — `b2b-model.ts` prose scan performance:** The `collectMarkdownFiles` function uses `readdirSync` recursively. For webgogol-com (~40-60 files) this is fine. For a large site with hundreds of prose files, this could be slow. The RFC documents the expected file count. No action needed now.

**Minor finding 3 — `buildRetiredPageRoutesBlock` slug normalization:** The slug is stripped of leading/trailing slashes but not normalized for locale-prefixed routes. If a `retiredRoutes` entry has `slug: "de/widerruf"`, the generated redirect would be `/de/widerruf/* / 410`. This is correct behavior — the RFC declares bare slugs (`widerruf`, not `de/widerruf`) — but the function doesn't validate this. Acceptable since the schema accepts any non-empty string.

### Spec compliance

| Requirement from RFC-0487 | Status | Evidence |
| --- | --- | --- |
| Add `retiredRoutes` field to `systemManifestSchema` | Done | `packages/ontology/src/schemas/system/manifest.ts:439-447` |
| Add `businessModel` field to `systemManifestSchema` | Done | `packages/ontology/src/schemas/system/manifest.ts:432` |
| Emit 410 entries from `retiredRoutes` in `_redirects` | Done | `buildRetiredPageRoutesBlock` in `app-boilerplate-helpers.ts:176-193` |
| `b2b.model.validate` command in `site-kernel-checks` | Done | `packages/os/site-kernel-checks/src/b2b-model.ts` |
| Wire into `sites-check-author` pipeline | Done | `sites-check-author.ts:240-241` |
| No-op when `businessModel` absent | Done | `b2b-model.ts:79-87` |
| Fully blocking (exit 1 on violations) | Done | `b2b-model.ts:172-184` |
| JSON output format | Done | `b2b-model.ts:172-183` (violations array with rule/file/message) |
| Regenerate `docs/COMMANDS.md` | Done | `docs/COMMANDS.md:75` |
| Regenerate `docs/ecosystem.generated.yaml` | Done | `docs/ecosystem.generated.yaml` (b2b.model.validate entry) |

### Questions for the author

1. The `SystemManifest` interface in `site-kernel-content` is a separate hand-maintained type, not imported from `@gogol/ontology`. Both were updated with the same fields — is there a plan to unify these types to prevent future drift, or is the duplication intentional?
2. The `b2b-model.ts` prose scan reads entire file contents into memory and runs regex. For sites with very large prose files (e.g., long AGB documents), should there be a file-size guard, or is the current approach acceptable given the expected file sizes?
3. The `buildRetiredPageRoutesBlock` function is not gated by `isWebgogolSite` (unlike `buildRetiredSurfaceRedirectBlock`). This means any site declaring `retiredRoutes` will get 410 entries. Is this intentional — should `retiredRoutes` be a general mechanism, or should it be webgogol-specific?
