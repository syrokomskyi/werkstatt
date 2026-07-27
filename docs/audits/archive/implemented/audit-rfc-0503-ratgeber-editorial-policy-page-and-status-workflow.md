---
rfcId: RFC-0503
auditId: AUDIT-RFC-0503-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0503

## Verdict: Needs revision

The RFC has solid conceptual foundations — a static editorial policy page, a three-state article status workflow, and a policy validator — but has structural gaps (missing Alternatives/Risks/Implementation notes sections), ecosystem-fit failures (Compass sync incomplete, cosmic naming unaddressed, URL schema pattern unspecified), and an agent-facing policy gap (no implementation notes, anti-fabrication boundary not stated). The hub baker link text specified in the RFC does not match the current implementation, and the `md` block type used for the "So arbeitet die Redaktion" block does not support links — the RFC must specify how the link is emitted.

## Mechanical validation (rfc.validate)

Pass with 4 warnings:

- **V-13**: Missing required section `## Alternatives considered`
- **V-13**: Missing required section `## Risks`
- **V-13**: Missing required section `## Implementation notes for agents`
- **V-19**: `RFC-0503.amends` includes `RFC-0500`, but `RFC-0500.amendedBy` does not include `RFC-0503`

## Axis A — Structural completeness

- **Missing sections**: `## Alternatives considered`, `## Risks`, `## Implementation notes for agents` are absent (V-13 warnings). RFC-0500, RFC-0501, and RFC-0502 all include these sections — RFC-0503 should follow the same pattern.
- **No TypeScript contracts**: The RFC provides no type signatures for the validator function, the policy page schema, or the required-sections configuration. RFC-0501 and RFC-0502 both include `### TypeScript contracts` subsections.
- **No `--json` output format**: The CLI surface shows the command invocation but does not document the `--json` output shape. RFC-0502 includes an explicit JSON example.
- **No exit codes**: The failure modes table specifies severities but does not document exit codes (0 = pass, 1 = error, 2 = warning-only). RFC-0500 and RFC-0501 both specify exit codes.
- **Rollout incomplete**: The rollout lists 7 steps but does not describe default behavior for new apps (do new apps need the policy page at onboarding?) or adoption path for existing apps beyond `webgogol-com`.
- **Decision section**: Present tense, single decision ✓. But it mixes the editorial policy page decision with the status workflow decision — two decisions in one RFC. This is acceptable for a tightly coupled pair, but the sections that follow should be explicit about which decision each addresses.

## Axis B — DNA alignment

- **DNA-16** (semantic layer shares topology with navigation): Listed in `satisfies[]` but the RFC body does not explain how it is satisfied. The editorial policy page is a static page — DNA-16 requires semantic outputs derived from the same route topology. The RFC should state whether the policy page appears in the route registry, sitemap, and JSON-LD, and how that aligns with `getRouteRegistry()`.
- **DNA-24** (block-declarative pages): Listed in `satisfies[]` but the body does not explain the block-declarative contract for the policy page. The RFC says the page lives at `src/content/prose/{lang}/ratgeber-redaktion.md` and is "registered in system.md as a static page" — but DNA-24 requires page entries under `src/content/pages/**` to be frontmatter-only documents with `blocks[]` referencing prose via `contentRef`. The RFC must clarify: is there a page entry in `src/content/pages/` with a `blocks[]` array referencing the prose file? Or is the prose file itself the page? This is a structural ambiguity that affects validation.
- **DNA-53** (semantic fingerprint governance): Listed but not explained. The RFC declares `versionBump: minor` which is correct for Breaks-B (new validator + new static page), but the body should state that the semantic hash change is expected and governed by the declared version bump.
- **No conflicts** with existing DNA invariants ✓.

## Axis C — Ecosystem fit

- **Compass sync incomplete**: The file system responsibilities table lists `docs/verification-plan.xml` and `docs/COMMANDS.md` but omits `docs/requirements.xml`, `docs/technology.xml`, and `docs/knowledge-graph.xml`. RFC-0500, RFC-0501, and RFC-0502 all update these three files. This is a repeatable gap.
- **AGENTS.md update missing**: The RFC does not mention updating `packages/os/site-kernel-checks/AGENTS.md` to document the new `ratgeber-policy-validate.ts` module. RFC-0501 and RFC-0502 both include this update.
- **Cosmic naming unaddressed**: The editorial policy page is a new page. If it is registered in `system.md` as a static page, it needs a `cosmicStar` from the `StarCatalog` (DNA-23). The RFC does not mention cosmic naming at all — no `cosmicStar`, no manifest, no `PLANET_IMPORT_PATHS` alignment. This is a DNA-23 compliance gap.
- **URL schema pattern unspecified**: The RFC says to add `/ratgeber/redaktion/` to `url-schema.yaml` but does not specify the route pattern. The current `url-schema.yaml` (`@/packages/ontology/src/external-surfaces/url-schema.yaml:1-48`) has patterns like `/:locale?/:slug` (generated: false) and `/:locale?/:industry/:city` (generated: true). The route `/ratgeber/redaktion/` is a two-segment static route — it does not match any existing pattern cleanly. The RFC must specify the exact pattern to add (e.g., `/:locale?/ratgeber/redaktion` with `generated: false`) and how it interacts with the existing `/:locale?/:slug` pattern. The UK variant `/porady/redaktsiya/` also needs a pattern or an alias mechanism.
- **Hub baker link mismatch**: The RFC specifies link text "Mehr zur Redaktion" (DE) / "Докладніше про редакцію" (UK) in the "Hub link" section. The current baker at `@/packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts:62` defines `redaktionLink: "Mehr zur redaktionellen Arbeit"` (DE) and `redaktionLink: "Дізнатися більше про редакційну роботу"` (UK) — these do not match the RFC's specified text. Additionally, the `redaktionLink` label is defined in `HUB_LABELS` but never used in the block emission: line 191 pushes `md(hlbl.redaktion, hlbl.redaktionBody)` — a `md` block takes only heading and lead, no link. The RFC must specify how the link is emitted: is the `md` block extended with a link? Is a different block type used (e.g., `ctaBlock`)? Is the link inline markdown in the body text?
- **Command lifecycle**: `commands.proposed` and `commands.added` both list `ratgeber.policy.validate` ✓. `commands.changed` lists `surface.validate` and `surface.contract.validate` ✓.
- **Package boundaries**: Validator in `packages/os/site-kernel-checks/` ✓, content in `src/content/prose/` ✓.

## Axis D — Forward-only compliance

No issues. The RFC creates a new static page and a new validator — no backward compatibility layers, no shims, no dual-paths. The RFC amends RFC-0500 directly.

## Axis E — Agent-facing policy

- **Missing implementation notes**: The `## Implementation notes for agents` section is absent (V-13). RFC-0500, RFC-0501, and RFC-0502 all include explicit agent behavioral rules (MUST/MAY/MUST NOT). The RFC must add this section with rules about: when implementation may begin (status: accepted), whether the policy page prose may be agent-generated or requires human authoring, and whether the `amendedBy` field on RFC-0500 must be updated.
- **Anti-fabrication boundary not stated**: The acceptance criterion "Policy page contains all 5 required sections" implies content authoring. The editorial policy page is editorial standards prose — not factual claims. It may be agent-generable (unlike claim sidecars in RFC-0502 which require human review). But the RFC must be explicit: is an agent allowed to draft the policy page content, or does it require human authoring? RFC-0501 and RFC-0502 both draw this boundary explicitly.
- **Status gate**: The RFC is `status: draft` and does not contain self-authorizing language ✓.
- **Storage policy**: No persistence changes ✓.

## Axis F — Pragmatism

- **No alternatives considered**: The `## Alternatives considered` section is missing. Key question: could `ratgeber.policy.validate` be a flag on `ratgeber.hub.validate` instead of a new command? The policy page validation (checking sections exist) is a different concern from hub validation (checking layout, cards, JSON-LD), so a separate command is likely justified — but the RFC must state this explicitly with a rejection reason, as RFC-0500 and RFC-0501 do.
- **Over-scoped `packagesImpacted`**: The RFC lists 5 packages: `@gogol/surface`, `@gogol/ontology`, `@gogol/site-kernel-checks`, `@gogol/share`, `@gogol/ui`. But the file system responsibilities only touch `@gogol/site-kernel-checks` (validator + baker update), `@gogol/ontology` (url-schema.yaml), and `tools/kernel.config.ts`. The RFC does not explain what changes in `@gogol/surface`, `@gogol/share`, or `@gogol/ui`. If these packages are not actually impacted, they should be removed. If they are, the RFC should list the specific files.
- **No TypeScript contracts**: See Axis A — the RFC provides no type signatures, making it harder for an implementing agent to understand the validator's shape.

## Axis G — Blind spots

- **Section heading matching unspecified**: RG-POL-02 checks for required sections by heading. The RFC does not specify: is matching exact or trimmed? Is it H2 only? Are trailing attributes like `{#id}` allowed? RFC-0501 was explicit about this (`## Einleitung {#intro}` fails — heading must be exactly `## Einleitung`). RFC-0503 should specify the same.
- **Edge cases**: What if the policy page exists for DE but not for UK? What if a language has no policy page? The RFC says the page must exist but does not address partial language coverage. DNA-11 (language mirroring) may apply — the RFC should state whether the policy page is mirrored across all supported languages.
- **Migration path**: The RFC creates new files — no content migration needed. But the `amendedBy` field on RFC-0500 must be updated to include RFC-0503 (V-19). The rollout does not mention this step. RFC-0501 and RFC-0502 both explicitly call out the `amendedBy` update in their implementation notes.
- **Performance**: The validator scans 1-2 policy page files per language plus article records for `reviewedAt` dates. Low cost. Not mentioned but not a concern.
- **RG-POL-04 and RG-POL-05 overlap with RFC-0500**: RG-POL-04 (published article fails `ratgeber.article.validate`) and RG-POL-05 (review-required article in surface artifact) overlap with RFC-0500's `RG-HUB-06` (non-published article in surface artifact) and RFC-0501's publication gate. The RFC should state whether `ratgeber.policy.validate` re-runs these checks or delegates to the existing validators. If it re-runs them, there is duplication; if it delegates, the dependency should be documented.

## Questions for the author

1. How is the editorial policy page registered in `system.md`? Is there a page entry in `src/content/pages/` with a `blocks[]` array referencing the prose file via `contentRef` (DNA-24), or is the prose file itself the page? What `cosmicStar` is assigned (DNA-23)?
2. What route pattern is added to `url-schema.yaml` for `/ratgeber/redaktion/` (DE) and `/porady/redaktsiya/` (UK)? How does it interact with the existing `/:locale?/:slug` pattern?
3. How is the hub link to the policy page emitted? The current `md` block type (`bake-blocks.ts:16`) takes only `heading` and `lead` — no link. Is the `md` block extended, is a different block type used, or is the link inline markdown in the body? The link text in the RFC ("Mehr zur Redaktion") does not match the baker's `redaktionLink` label ("Mehr zur redaktionellen Arbeit") — which is authoritative?
