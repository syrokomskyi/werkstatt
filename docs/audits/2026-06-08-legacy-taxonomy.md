# Legacy Taxonomy and Refactor Candidates

This audit classifies stale references and legacy-looking surfaces found during the ecosystem refactor so future cleanup can delete only proven-dead code and keep compatibility shims intentional.

## Scope

- Repository-wide grep for legacy content surfaces, old workspace paths, component-content terminology, and retired aliases.
- No runtime deletion was performed in this wave.
- Historical RFC files are treated as archival by default and are not cleanup targets unless they actively mislead current agent workflows.

## Findings Summary

| Class | Status | Action |
| --- | --- | --- |
| Retired RFC-0047 app surfaces | Not present in active app tree | Keep validators; no deletion needed |
| README public guidance | Cleaned in Wave 1 | Done |
| Compass inventory | Regenerated and working | Keep generated artifact current |
| `packages/site-kernel` path drift | Partially cleaned in active guides | Continue in non-authoritative docs only if touched |
| `componentContent` terminology | Mixed: type names, compatibility APIs, stale comments | Do not bulk-delete; classify per call site |
| `@icons/*` aliases | Documentation-only legacy import guidance | Low-risk doc cleanup candidate |
| Feature graph / `src/content/features` | Retired app surface; feature commands may still exist | Requires RFC for replacement feature system |
| Cookie mentions | Mostly policy/legal/cookieless references | Do not remove policy references |

## Active Tree Checks

### Retired app content folders

- `apps/**/system.yaml`: **0 active files found**
- `apps/**/src/content/components`: **0 active directories found**
- `apps/**/src/content/features`: **0 active directories found**

Interpretation: RFC-0047 migration is structurally complete for active apps. Remaining references are documentation, comments, validators, or historical RFCs.

## `componentContent` Classification

### Keep: semantic type names

Examples:

- `BrandLabelComponentContent`
- `HeaderComponentContent`
- `LangSwitcherComponentContent`
- `FooterPromoComponentContent`
- `DonationCardComponentContent`
- `BreadcrumbsComponentContent`

Reason: These names describe component prop/content shapes in TypeScript, not the retired `src/content/components` directory.

### Keep for now: compatibility resolver API

Examples:

- `getResolvedComponentContent(...)` usage in shared components.

Reason: This appears to be a compatibility API name backed by newer site/page context. Renaming it is API churn and should be done under an RFC if the goal is semantic clarity.

### Candidate: stale comments only

Examples:

- `packages/ui/src/sections/markdown/markdown-section.astro` mentions `componentContent collection` for a `prose/<slug>.<lang>` reference.

Recommended action: update wording from `componentContent collection` to `prose content domain` when editing this file next. This is comment-only cleanup and should not change runtime behavior.

### Candidate: local variable naming

Examples:

- `packages/ui/src/sections/donation-card/donation-card-section.astro` uses a local variable named `componentContent` for data derived from business/legal data.

Recommended action: rename to `donationData` or `resolvedDonationData` only if touching the file for related work. Avoid churn-only runtime edits.

## Path Drift Classification

### Authoritative guides cleaned

Already updated in Wave 2:

- Root `AGENTS.md` import/export rule.
- OS package-level `AGENTS.md` files.
- App boilerplate `AGENTS.template.md` shared architecture paths.
- Site OS operator docs.
- Compass operations docs.

### Remaining path drift to treat cautiously

Historical RFCs still contain `apps/main` or `packages/site-kernel` references. These should usually remain unchanged because they preserve decision history. If a current guide quotes an old RFC, add a note in the current guide rather than rewriting the RFC.

## Feature System Legacy

`feature.visibility.validate` and feature graph references should not be removed yet.

Reason:

- There is an outstanding direction to design a new content-layer feature system with page/section/component/content-element visibility and behavior overrides.
- That system requires an RFC before implementation.
- Draft RFC-0183 now captures the proposed replacement: content-layer Feature Policy in existing RFC-0047 domains, without reintroducing `src/content/features/**`.

Recommended action:

1. Review and accept RFC-0183.
2. Define migration from old feature graph semantics.
3. Only then remove old feature validators or app helpers.

## Generated-File Governance

`generator.ownership.lint` passed. App files carrying the generated marker must not be edited directly.

Recommended cleanup policy:

- For generated app instructions or configs: edit owning templates under `packages/os/site-kernel-codegen` or `packages/os/site-kernel-onboarding`.
- Regenerate app outputs through Site OS commands.
- Do not remove generated markers unless ownership is intentionally transferred to project-specific maintenance.

## RFC Cleanup Policy

Do not mass-edit historical RFCs for path modernization.

Allowed RFC edits:

- Status/frontmatter lifecycle fixes.
- Addendum notes that a newer RFC supersedes an old path or architecture.
- Referential integrity fixes required by `rfc.validate`.

Disallowed by default:

- Rewriting old examples purely to remove `apps/main`.
- Replacing historical package paths where they describe past implementation state.

## Recommended Next Refactor Backlog

| Priority | Candidate | Type | Safe Action | Requires RFC |
| --- | --- | --- | --- | --- |
| High | `markdown-section.astro` stale `componentContent collection` comment | Comment/doc drift | Update wording on next related edit | No |
| High | Feature graph / visibility replacement | Architecture | Draft/accept feature-system RFC | Yes |
| Medium | `getResolvedComponentContent` API naming | Compatibility API | Decide whether to keep alias or introduce clearer API | Likely |
| Medium | Donation card local variable `componentContent` | Naming clarity | Rename during related section refactor | No |
| Medium | `@icons/*` README references in UI docs | Doc drift | Replace with `@warpgogol/ui/icons` guidance | No |
| Low | Historical RFC `apps/main` references | Archive drift | Leave unchanged or add supersession notes | No, unless lifecycle changes |

## Verification Commands

```bash
pnpm exec werkstatt run compass.inventory
pnpm exec werkstatt run generator.ownership.lint
pnpm exec werkstatt run content.surface.validate --app nicaragua-projekt
pnpm exec werkstatt run content.surface.validate --app warpgogol-com
```

## Conclusion

The active app tree no longer contains the retired RFC-0047 physical content surfaces. The remaining legacy work is mostly semantic cleanup and architecture migration, not blind deletion. The highest-value next step is a focused RFC for the next-generation content-layer feature system before touching feature graph runtime code.
