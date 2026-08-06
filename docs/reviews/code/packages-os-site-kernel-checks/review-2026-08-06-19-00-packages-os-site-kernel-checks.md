---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 45a903b1...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0720-document-generator-ownership-map-requirement.md
---

# Code Review: 45a903b1...HEAD (RFC-0720 implementation)

### Verdict: Approved

Documentation-only change adding `markerPolicy: "registry-only"` to the `GENERATOR_OWNERSHIP_MAP` example in `site-kernel-checks/AGENTS.md` and a cross-reference note in `site-kernel-handoff/AGENTS.md`. Both edits are minimal, accurate against the actual `OwnershipEntry` interface, and directly implement the RFC's design. Zero findings across all seven axes.

### Mechanical floor

Pass — no code changes. `rfc.validate --id RFC-0720 --json` returned exitCode 0 with zero violations.

### Axis A — Structural correctness

No issues. No code changes — documentation-only diff.

### Axis B — DNA alignment

No issues. RFC-0720 has `satisfies: []` — it documents an existing enforcement mechanism (RFC-0087 ownership, RFC-0612 `ownership.sync.validate`), not a new DNA invariant.

### Axis C — Ecosystem fit

No issues. The AGENTS.md changes are the implementation itself. The `markerPolicy` field in the example matches the actual `OwnershipEntry` interface (`markerPolicy?: "embedded" | "registry-only"`). The cross-reference in `site-kernel-handoff/AGENTS.md` correctly points to `packages/os/site-kernel-checks/src/generator-ownership.ts` and the `§ Generator ownership map` section.

### Axis D — Forward-only compliance

No issues. No backward compatibility, no shims, no dual paths.

### Axis E — Agent-facing clarity

No issues. The example is accurate: `path`, `command`, `module`, and `markerPolicy: "registry-only"` are all valid `OwnershipEntry` fields. The comment `// required for public/** files` matches the interface documentation: `public/** and binary files → "registry-only"`.

### Axis F — Pragmatism

No issues. Minimal edits — only the two files specified in the RFC. No scope creep.

### Axis G — Blind spots

No issues. The note already covers `conditional: true` semantics (exempt from OWN-02, still contribute to coverage checks). The `markerPolicy` addition closes the gap identified in the audit (Axis G, blind spot #2).

### Spec compliance

| Requirement from RFC-0720 | Status | Evidence |
| --- | --- | --- |
| Add section to `site-kernel-checks/AGENTS.md` | Done | `packages/os/site-kernel-checks/AGENTS.md:201-216` |
| Add cross-reference to `site-kernel-handoff/AGENTS.md` | Done | `packages/os/site-kernel-handoff/AGENTS.md:39` |
| Include `markerPolicy: "registry-only"` in example | Done | `packages/os/site-kernel-checks/AGENTS.md:212` |
| Mention `conditional: true` semantics | Done | `packages/os/site-kernel-checks/AGENTS.md:216` |
| `rfc.validate` passes with zero errors | Done | exitCode 0, zero violations |

### Questions for the author

None.
