---
rfcId: RFC-0631
auditId: AUDIT-RFC-0631-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0631

## Verdict: Needs revision

The RFC is well-crafted and addresses a real DNA-4 violation (favicon design hardcoded in a shared package instead of `src/content/`). Three findings need revision before implementation: a missing acceptance criterion for `ICON-SRC-03`, an unspecified AGENTS.md update target for the new agent-facing rule, and an unspecified failure path when `sharp` fails to convert a valid-XML source SVG.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Missing acceptance criterion for ICON-SRC-03.** The diagnostic rules section defines three rules: `ICON-SRC-01` (wrong viewBox), `ICON-SRC-02` (invalid XML), `ICON-SRC-03` (maskable source wrong viewBox). The acceptance criteria cover ICON-SRC-01 and ICON-SRC-02 but not ICON-SRC-03. A criterion like `public.icons.validate reports ICON-SRC-03 when maskable source SVG has wrong viewBox` should be added to ensure the maskable validation path is tested.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-4]` is correct — DNA-4 states "All user-visible copy, configuration, and metadata live in `src/content/`", and the RFC moves favicon SVG source from `packages/os/site-kernel-checks/src/public-surface/icons.ts:75` (shared package) to `src/content/favicon.svg` (content layer). The RFC body explains how it extends the invariant. `related: [DNA-4, RFC-0309]` are both relevant — RFC-0309 is the original icon generation suite being extended.

## Axis C — Ecosystem fit

- **AGENTS.md update target not identified.** The RFC adds a new agent-facing rule in Implementation notes: "Agents MUST NOT edit `public/favicon.svg` directly — it is a generated file. The source is `src/content/favicon.svg`." However, the RFC does not identify which documentation file should be updated to reflect this rule persistently. The root AGENTS.md site composition principle ("A site's job is composition only: `src/content/system.md` + `src/content/**` + a few thin proxy files") or `docs/authoring/site-composition.md` should mention `src/content/favicon.svg` as a site-authored content file so agents discover the override mechanism without reading the RFC. The RFC should name the target file in its Rollout or Implementation notes.

## Axis D — Forward-only compliance

No issues. The `buildIconSvg` fallback is not a legacy compatibility layer — it is the zero-config default for sites without a custom SVG. No dual-path, no deprecation, no backward compatibility shim.

## Axis E — Agent-facing policy

No issues. Status gate is correct — the RFC is `draft` and Implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." References to RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation) are correct. No self-authorizing language. No content authoring claims. No persistence touched.

## Axis F — Pragmatism

No issues. No new commands — two existing commands change behavior, correctly listed in `commands.changed`. `resolveIconSvg` and `validateSourceSvg` are minimal type signatures. `packagesImpacted: [site-kernel-checks]` is the only impacted package. `nonGoals` are explicit and meaningful (no generalization to og-image/preview, no `buildIconSvg` redesign, no maskable-specific source requirement).

## Axis G — Blind spots

- **Sharp conversion failure path unspecified.** The Failure modes section specifies fallback to `buildIconSvg` when the source SVG is "invalid XML" (ICON-SRC-02), but does not address what happens when `sharp` throws during PNG/ICO conversion of a source SVG that is valid XML but not a valid SVG document (e.g., root element is `<html>`, or SVG references unsupported features). The current `pngFromSvg` at `packages/os/site-kernel-checks/src/public-surface/icons.ts:93` calls `sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()` — if this throws for a structurally invalid SVG, the generator would crash instead of falling back. The RFC should specify: either (a) the generator wraps sharp conversion in try/catch with `buildIconSvg` fallback, or (b) `validateSourceSvg` additionally checks for a valid `<svg>` root element before the generator runs.

## Questions for the author

1. Should the generator fall back to `buildIconSvg` when `sharp` throws during PNG conversion of a valid-XML source SVG, or should `validateSourceSvg` pre-validate the SVG root element to prevent the generator from reaching sharp with an invalid SVG?
2. Which documentation file (root `AGENTS.md`, `docs/authoring/site-composition.md`, or `packages/os/site-kernel-checks/AGENTS.md`) should be updated to document the `src/content/favicon.svg` override mechanism for agent discoverability?
3. Should `ICON-SRC-03` (maskable source wrong viewBox) have its own acceptance criterion, or is it covered by the ICON-SRC-01 criterion since both check the same viewBox constraint?
