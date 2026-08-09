---
rfcId: RFC-0778
auditId: AUDIT-RFC-0778-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0778

## Verdict: Needs revision

The RFC redefines VIDEO-01..09 invariant IDs that already exist with different semantics in the forge `editframe.yaml` profile, creating a direct collision. Additionally, `commands.proposed` and `packagesImpacted` are empty despite the RFC proposing 3 commands and creating a new package, and `satisfies[]` is incomplete relative to DNA invariants the body claims to extend.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **`commands.proposed` is empty** (line 43). The RFC proposes three commands: `video.composition.validate`, `video.render.validate`, `video.assets.validate` (lines 92, 178-181). These must be listed in `commands.proposed` per the frontmatter contract.
- **`packagesImpacted` is empty** (line 49). The RFC creates `packages/werkstatt-video` (line 86). It must be listed here.
- **No `--json` output format** for the three proposed commands. RFC-0770 and RFC-0772 both document JSON output shapes; this RFC should follow the same pattern for consistency.
- **`extract.config.yaml` is an acceptance criterion** (line 214) but is not discussed in the Design section. The Design should reference RFC-0773 and describe the extraction config shape for the video plugin.

## Axis B — DNA alignment

- **CRITICAL: VIDEO-01..09 invariant ID collision.** The forge `editframe.yaml` profile (`packages/forge/profiles/editframe.yaml:84-163`) already defines `VIDEO-01` through `VIDEO-09` with different semantics:
  - Forge profile `VIDEO-01`: composition filenames must use kebab-case.
  - RFC-0778 `VIDEO-01`: composition has a valid time model (duration > 0, frame rate > 0).
  - Forge profile `VIDEO-03`: all speech audio elements must have corresponding Captions components.
  - RFC-0778 `VIDEO-03`: composition is deterministic (render hash stability).
  - All nine IDs conflict. The RFC must either use a different prefix (e.g. `WV-01..09` for werkstatt-video) or explicitly state that the forge profile invariants are being superseded/replaced by the plugin's invariants, with a migration plan. The RFC body says "VIDEO-01..09 from Editframe skills, formalized" (line 98) but the forge profile already formalized them — the RFC's versions are different invariants, not formalizations.
- **`satisfies: [DNA-1]` is incomplete.** The RFC body references DNA-64 (line 133), DNA-46..49 (line 134), DNA-52 (lines 135, 110), DNA-58 (line 136). DNA-58 is explicitly extended by VIDEO-03 ("extends this to rendered video output"). DNA-52 is referenced for artifact storage. These should appear in `satisfies[]` or the body should not claim to extend them.
- **DNA-64 is not yet in `docs/architecture-dna.md`** (RFC-0769 is still draft). The RFC body references it (line 133) but cannot satisfy a non-existent invariant. This is acceptable during the wave plan but should be noted — once RFC-0769 is implemented and DNA-64 is registered, this RFC's `satisfies[]` should include it.

## Axis C — Ecosystem fit

- **`related[]` is missing RFC-0777** (game plugin). The Rollout section says "Implemented after the game plugin (RFC-0777)" (line 192) but RFC-0777 is not in `related[]` (lines 24-28). RFC-0777 is a direct sibling in wave 5 following the same plugin pattern; it should be listed.
- **`related[]` is missing RFC-0773** (publication pipeline). The acceptance criteria reference `extract.config.yaml` (RFC-0773) but it's not in `related[]`.
- **No pipeline placement specified** for the three validators. The RFC doesn't state whether `video.composition.validate` runs in `build.prepare`, `build.check`, or is on-demand only. RFC-0770 hooks (`checkGate`) are referenced but the mapping is not explicit.
- **No `AGENTS.md` update plan.** The RFC doesn't identify which `AGENTS.md` files need updates (root, `packages/werkstatt-video/AGENTS.md`, consumer workshop `AGENTS.md`).

## Axis D — Forward-only compliance

No issues. The RFC is forward-only — no compatibility shims, no dual-paths, no legacy maintenance.

## Axis E — Agent-facing policy

- No self-authorizing language found. The RFC correctly states "Implemented after the game plugin (RFC-0777)" as a sequencing note, not implementation permission.
- No NEEDS CLARIFICATION markers.
- Implementation notes are standard template — no issues.

## Axis F — Pragmatism

- **Three separate validator commands** (`video.composition.validate`, `video.render.validate`, `video.assets.validate`) — consistent with RFC-0777's pattern (game.assets/scenes/bundle.validate). Acceptable, but the RFC should justify why a single `video.validate` with `--scope` flag is insufficient, or note that it follows the game plugin precedent.
- **`local-render` is the only deploy adapter.** The RFC mentions R2/S3 storage (line 93) but only one adapter. The game plugin has two adapters (github-pages, cloudflare-pages). The RFC should note whether additional adapters are deferred or if `local-render` covers all cases via configuration.

## Axis G — Blind spots

- **VIDEO-03 render determinism is under-specified.** The RFC says "rendered video must be byte-identical across runs" (line 203) but doesn't describe how this is achieved. Video encoding is notoriously non-deterministic across ffmpeg versions, platforms, and codec implementations. The Risks section mentions "deterministic render settings (fixed codec, fixed frame rate, no metadata)" but doesn't specify them. RFC-0603 solved this for PNGs with sharp options; VIDEO-03 needs the same level of specificity for video encoding.
- **VIDEO-05 (Editframe API rate limits) has no enforcement mechanism.** The RFC declares the invariant but doesn't describe how it's checked — static analysis of composition source? Runtime monitoring? This invariant may not be machine-checkable in a validator.
- **Large video files in artifact store** — the Risks section references "DNA-59" for lifecycle tiering (line 204), but DNA-59 is about evidence preservation (Axiom evidence in R2), not video artifact storage. The relevant invariant is DNA-52 (artifact store). The mitigation should reference DNA-52 and describe how the artifact store handles large video files (chunking, lifecycle policies, size limits).
- **No false-positive rate estimation** for the validators.
- **No empty state consideration** — what happens when `video.assets.validate` runs on a composition project with no assets, or `video.render.validate` runs before any render exists?

## Questions for the author

1. The forge `editframe.yaml` profile already defines VIDEO-01..09 with different semantics. Should the plugin use a different invariant prefix (e.g. `WV-01..09`), or should the forge profile invariants be superseded by the plugin's? If superseded, what is the migration plan for existing compositions validated against the forge profile?
2. VIDEO-03 requires byte-identical render output across runs. Which specific encoding settings (codec, container, frame rate, metadata stripping) guarantee determinism, and how does this interact with ffmpeg version differences across CI and local environments?
3. VIDEO-05 (Editframe API rate limits) is declared as an invariant but has no described enforcement mechanism. Is this a static analysis check, a runtime guard, or an advisory invariant? If it cannot be machine-checked, should it be an invariant or a guideline?
