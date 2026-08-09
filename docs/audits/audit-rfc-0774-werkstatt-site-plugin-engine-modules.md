---
rfcId: RFC-0774
auditId: AUDIT-RFC-0774-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0774

## Verdict: Needs revision

RFC-0774 is structurally sound and fits the wave-3 charter, but has three substantive gaps: `packagesImpacted` is empty despite creating and deleting 9+ packages, `site-kernel-check-warpgogol` is absent from the module table, and the "old packages deleted" acceptance criterion conflicts with the rollout's "switch is atomic in RFC-0776" statement.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A1 — Acceptance criterion "test suites pass unchanged" is ambiguous.** Criterion 2 says "All site kernel commands keep their existing ids and behavior (test suites pass unchanged)". Test suites live in the old packages which are being deleted. The criterion should say "test suites move with their modules and pass from the new location" — otherwise "unchanged" is misleading: the physical paths change.

- **A2 — No CLI surface section.** The RFC references `werkstatt.plugin.validate` (from RFC-0770) in acceptance criteria but doesn't show the command invocation. Since this RFC proposes no new commands, a full CLI surface section is not required, but the acceptance criterion should at least cite the command: `pnpm exec site-kernel run werkstatt.plugin.validate --json`.

## Axis B — DNA alignment

- **B1 — `satisfies: [DNA-3]` is a weak fit.** DNA-3 says "All visitor-facing apps use Astro" — it's about framework choice, not about where Astro modules physically live. The RFC moves the implementation of DNA-3 compliance into a plugin; it doesn't enforce, protect, or extend the invariant itself. The connection is indirect. Consider adding DNA-64 (once RFC-0769 is accepted and the invariant exists in `docs/architecture-dna.md`) as the primary `satisfies` entry, since this RFC is the first full plugin implementer of the engine/plugin boundary.

- **B2 — Architectural fit references DNA-5, 7..17, and DNA-64 without adding them to `satisfies[]`.** The RFC body says "DNA-5, 7..17 (site content/structure contracts) — their validators travel inside `checks/`; semantics unchanged" and "DNA-64 — the plugin is the first full implementer". If the RFC protects these invariants by relocating their validators, that relationship should be declared in `satisfies[]` (for DNA-5 etc.) or acknowledged as a dependency (for DNA-64, which doesn't exist yet).

## Axis C — Ecosystem fit

- **C1 — `packagesImpacted: []` is empty but should list all impacted packages.** The RFC creates `packages/werkstatt-site` and deletes `packages/os/site-kernel-{astro,checks,codegen,content,onboarding,audit,deploy,changelog}`. At minimum, `packages/werkstatt-site` (added) and the 8 deleted packages should be listed. Leaving this empty contradicts the RFC's own file system responsibilities table.

- **C2 — `related[]` is missing RFC-0772 and RFC-0773.** The Rollout section says "Implemented immediately after RFC-0772 phase 6" — this is a direct dependency on RFC-0772. RFC-0773 defines the publication pipeline for the resulting `@warpgogol/werkstatt-site` package. Both should be in `related[]`.

- **C3 — `site-kernel-check-warpgogol` is absent from the module table.** This package exists at `packages/os/site-kernel-check-warpgogol/` (20 items) and depends on `@warpgogol/site-kernel-astro`, `@warpgogol/site-kernel-content`, `@warpgogol/check-core`, `@warpgogol/check-runner-node` — all site-stack or domain packages that are being moved. Its destination (plugin `checks/`, domain layer per RFC-0775, or workshop-local) must be specified. Without this, the package is orphaned after the consolidation.

- **C4 — Deploy row wording is confusing.** The table says `deploy/cloudflare-workers/` source is "site-kernel-handoff adapter + site-kernel-deploy site parts". But RFC-0771 sends `site-kernel-handoff` to the **engine** (adapter framework), not the plugin. The RFC should clarify: only the **concrete Cloudflare Workers adapter** moves to the plugin; the adapter framework stays in the engine. Current wording reads as if handoff itself is being pulled into the plugin.

## Axis D — Forward-only compliance

No issues. Old packages are deleted, no compatibility shims proposed. The temporary re-export scaffold during construction is explicitly a RFC-0772 mechanism, not this RFC's concern.

## Axis E — Agent-facing policy

- **E1 — `reviewers: []` is empty.** Add at least one reviewer (e.g. `human:andrii-syrokomskyi`) before transitioning to `accepted` (V-25 enforcement).

No self-authorizing language found. No NEEDS CLARIFICATION markers. Implementation notes are standard template.

## Axis F — Pragmatism

- **F1 — `packagesImpacted` scope discipline.** Already flagged as C1. The empty list is not "unknown" — the RFC knows exactly which packages it creates and deletes.

No other pragmatism issues. The RFC proposes no new commands (correct for a consolidation). `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

- **G1 — "Old site-kernel stack packages deleted" acceptance criterion conflicts with rollout.** Acceptance criterion 5 says old packages are deleted. Rollout says "tools/kernel.config.ts still references old module paths; the switch is atomic in RFC-0776." If old packages are deleted in this RFC but `kernel.config.ts` still imports from them, the workshop can't build between this RFC and RFC-0776. The RFC must resolve this: either (a) old packages are deleted in RFC-0776, not here, or (b) `kernel.config.ts` is updated in this RFC too, or (c) the temporary re-export scaffold from RFC-0772 phase 1–5 bridges the gap — and this is explicitly stated.

- **G2 — `site-kernel-check-warpgogol` dependency breakage.** Already flagged as C3. From a blind-spot perspective: this package's dependencies (`site-kernel-astro`, `site-kernel-content`) are being deleted. Without a destination decision, this is a build-breakage risk that the RFC doesn't address.

## Questions for the author

1. Where does `site-kernel-check-warpgogol` go — plugin `checks/`, domain layer (RFC-0775), or workshop-local? Its dependencies are being moved/deleted; it needs a destination.
2. Are old site-kernel packages deleted in this RFC or in RFC-0776? If here, how does the workshop build between this RFC and RFC-0776 — does the RFC-0772 temporary re-export scaffold bridge the gap?
3. Should `satisfies[]` include DNA-64 (once established by RFC-0769) as the primary invariant, given that this RFC is the first full plugin implementer of the engine/plugin boundary?
