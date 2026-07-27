---
rfcId: RFC-0528
auditId: AUDIT-RFC-0528-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0528

## Verdict: Needs revision

The RFC correctly identifies three real bugs in the current `material.metadata.write` (pipeline position, file discovery, coverage gap) and proposes a sound fix. However, it references a non-exported function (`loadSiteSemanticProfile`) as if it were public API, violates V-24 by leaving `satisfies: []` empty on an architecture RFC, and doesn't address exiftool performance cost for large variant sets.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation targeting this RFC:

- **V-24** (error): architecture RFC created 2026-07-25 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). The RFC has `satisfies: []`.

## Axis A — Structural completeness

No issues. The RFC has all required sections with real content:

- **Decision** is present tense ("Move...", "reads three variant manifests...").
- **CLI surface** is implicit (existing commands, no new invocations shown, but the exiftool command sketch is concrete).
- **File system responsibilities** are concrete (`public/_video/`, `public/_img/`, variant manifest paths).
- **Rollout** describes 6 sequential steps.
- **Alternatives considered** has 4 real alternatives with rejection reasons.
- **Risks** covers exiftool availability, manifest staleness, WebP metadata support, and content reference resolution failures.
- **Acceptance criteria** are 11 checkable items covering the full decision scope.
- **Implementation notes** are explicit behavioral rules (idempotency, no master mutation, HLS skip, exiftool graceful skip).

## Axis B — DNA alignment

**Fail** — `satisfies: []` is empty. This is an architecture-scope RFC created after 2026-07-07, so V-24 (RFC-0331) requires at least one DNA invariant. The RFC body doesn't claim to establish a new DNA invariant, nor does it explain how it enforces or protects an existing one. The RFC should either:

1. Declare a relevant existing DNA invariant in `satisfies[]` with a body explanation (e.g. DNA-4 — canonical content drives derived metadata), or
2. Be reclassified from `kind: architecture` to `kind: command` if no DNA invariant applies.

`related[]` references (RFC-0226, RFC-0220, RFC-0527, RFC-0529) are all relevant and non-decorative. No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

**Fail** — `loadSiteSemanticProfile` is referenced as available from `@gogol/site-kernel-content` (§4, line 138), but it is a **private function** in `@/packages/os/site-kernel-content/src/semantic-loader.ts:179`. It is not exported from the package's public API (`src/index.ts`). The only exported semantic functions are `loadSemanticSiteModel`, `createNodeFsContentProvider`, and `createFsSemanticReader`. The RFC must either:

1. Explicitly request exporting `loadSiteSemanticProfile` from `@gogol/site-kernel-content` (and add this to the Rollout), or
2. Use `loadSemanticSiteModel` (which is exported and returns `SemanticSiteModel` containing `organization`), or
3. Use `buildOrganizationProfile` / `buildPbpSemanticProfile` from `@gogol/share/semantic` or `@gogol/pbp/semantic-profile` directly.

**Minor** — The RFC doesn't identify which `docs/*.xml` Compass files need synchronization. Since it changes the `build-prepare` pipeline ordering and package contracts, `docs/verification-plan.xml` likely needs updating.

**Minor** — The RFC doesn't mention which `AGENTS.md` files need rule updates. `packages/os/site-kernel-codegen/AGENTS.md` or `packages/AGENTS.md` may need updates to reflect the new manifest-based discovery and SemanticSiteProfile fallback.

**Pass** — Package boundaries are correct: `material.metadata.write` (codegen) → `@gogol/share/schemas/material-credit`, `@gogol/site-kernel-content`. No `apps/* → apps/*` imports.

**Pass** — Pipeline placement is correct. The RFC moves `material.metadata.write` from line 67 (before variant generators) to after `live.variants.generate` (line 101). Verified against `@/packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:67` (current position) and lines 97-101 (variant generators).

**Pass** — `commands.changed` lists `material.metadata.write` and `material.metadata.validate` — both are existing registered commands being modified. Correct bucket.

## Axis D — Forward-only compliance

No issues. The RFC directly replaces the broken `dist/_astro/` basename search with manifest-based discovery — no dual-path or compatibility shim. The old behavior is deleted, not maintained behind a flag. The RFC amends RFC-0226 by changing its contract directly.

## Axis E — Agent-facing policy

No issues. The RFC has `status: draft` and implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." References to RFC-0224 (accepted→implemented) and RFC-0334 (supersede escalation) are present. No self-authorizing language.

## Axis F — Pragmatism

**Minor** — `packagesImpacted` lists `@gogol/site-kernel-content`, but the RFC doesn't explicitly describe what changes in that package. If the intent is to export `loadSiteSemanticProfile`, this should be stated in the Rollout. If the package is only consumed (not modified), it should be removed from `packagesImpacted`.

**Pass** — No new commands proposed. Only existing commands are changed. Good scope discipline.

**Pass** — `nonGoals` are explicit and meaningful (6 items: no content ref index, no migration, no encoding pipeline changes, no HLS/captions, no runtime/URL/JSON-LD changes, no audio pipeline).

## Axis G — Blind spots

**Fail** — **Performance cost is not addressed.** The RFC proposes calling `exiftool` once per derived file (§7, Design → Processing flow, step 5d). For a site with many media assets (e.g. 50 images × 5 width variants + 10 videos × 3 formats + posters = 280+ files), this means 280+ process spawns. Each exiftool invocation takes ~100-300ms. This could add 30-90 seconds to the build. The RFC should:

1. Estimate the file count and cost, or
2. Consider batching (exiftool can process multiple files in one invocation), or
3. Consider parallel execution with a concurrency limit.

**Minor** — The RFC doesn't describe behavior when variant manifests are empty (new site with no videos/images). Should `material.metadata.write` report a pass with zero files, or a skip? This edge case should be documented.

**Pass** — HLS segments and caption files are explicitly skipped. Files without credits get fallback metadata. exiftool-unavailable graceful skip is preserved.

**Pass** — No security/privacy concerns. No user data or PII touched.

## Questions for the author

1. `loadSiteSemanticProfile` is a private function in `@gogol/site-kernel-content/src/semantic-loader.ts:179`, not exported from the package's public API. Should the RFC explicitly request exporting it, use `loadSemanticSiteModel` (which is exported and returns `SemanticSiteModel.organization`), or use `buildOrganizationProfile` from `@gogol/share/semantic` directly?
2. The `satisfies: []` frontmatter violates V-24 (RFC-0331). Which DNA invariant does this RFC enforce, protect, or extend? If none applies, should the RFC be reclassified from `kind: architecture` to `kind: command`?
3. The RFC proposes calling exiftool once per derived file. For sites with hundreds of variants, this could add 30-90 seconds to the build. Should the implementation batch exiftool calls (multiple files per invocation) or run them with a concurrency limit?
