---
id: RFC-0073
title: "Establish content discipline validators: coverage, voice, business, references"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: 2026-05-18
implementedAt: 2026-05-18
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0513
related:
  - DNA-24
  - RFC-0026
  - RFC-0042
  - RFC-0045
  - RFC-0047
  - RFC-0053
  - RFC-0070
  - RFC-0072
  - RFC-0075
commands:
  proposed:
    - content.business.validate
    - content.coverage.validate
    - content.references.validate
    - content.voice.lint
  added:
    - content.business.validate
    - content.coverage.validate
    - content.references.validate
    - content.voice.lint
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - share
  - business
  - os/site-kernel-checks
successSignals:
  - content.coverage.validate proves every atom listed in onboarding/.output/04-author/atoms.yaml is placed in at least one block prop or explicitly marked unused with a reason from a closed enum
  - content.voice.lint deterministically catches forbidden phrases declared by the biome (RFC-0071) and the family tone-of-voice template, plus per-client overrides in 28-tone-of-voice.md atomized into onboarding/.output/04-author/voice-profile.yaml
  - content.business.validate enforces that every src/content/business/{lang}/*.md file is fully populated or carries explicit NEED_THIS_<FIELD> markers (RFC-0042)
  - content.references.validate verifies every {collection.file.field} reference (RFC-0045) resolves at build time, with file/line precision in diagnostics
  - All four validators live in APPS_CHECK_PIPELINE and run on every app build — not only during onboarding
nonGoals:
  - Atomization itself (the agent's prompt-time work; the validator consumes the produced atoms.yaml)
  - Synthesis of page YAMLs from atoms (also the agent's prompt-time work in the author phase)
  - Translation, image selection, or design-quality judgment (out of scope)
  - LLM-driven voice rewriting (RFC-0074 covers LLM audits; this RFC's voice lint is forbidden-phrase matching only)
---

# RFC-0073: Establish content discipline validators: coverage, voice, business, references

## Context

The author phase (RFC-0070) is dominated by _synthesis_: the agent reads the in-scope copy materials (`29-conversion-texts.md`, `32-microcopy.md`, `33-faq.md`, `34-metadata.md`, `28-tone-of-voice.md`, `11-trust-bank.md`, `10-story-bank.md` and others), maps each fragment to a place in the site, and writes the page YAMLs, the prose files, the business YAMLs, and the navigation/site/label files. That synthesis is LLM judgment and belongs in a workflow prompt, not in TypeScript.

What does belong in TypeScript are the _gates_ that catch mistakes the synthesis would otherwise make silently: sentences that disappear from materials to site, forbidden phrases that slip through, business fields that get hard-coded into prose, data references that point at nothing.

The legacy `.agents/workflows/plant-content.md` mixed both — atomization, deduplication, clustering, coverage check, schema enforcement, all in prose — and was incompatible with the current `system.md` + block-declarative + business-layer architecture. This RFC keeps only the _checking_ portions as kernel commands; the synthesis logic moves entirely to the workflow prompts (RFC-0075).

## Problem

1. **No coverage gate.** Sentences silently drop from materials to the synthesized site; nothing fails the build.
2. **No deterministic voice enforcement.** `28-tone-of-voice.md` and biome constraints declare forbidden phrases, but nothing lints synthesized props against them.
3. **Business data drifts.** Bank/legal/contact info appears in prose where it should live in `src/content/business/{lang}/`; or business YAMLs miss required fields and the gap surfaces only at deploy.
4. **Reference resolution is partial.** RFC-0045 introduced `{collection.file.field}` markdown references, but there is no first-class validator that scans every content file and confirms every reference resolves.

## Decision

Four single-purpose validators land in `@gogol/site-kernel-checks` and join `APPS_CHECK_PIPELINE`:

1. **`content.coverage.validate`** — proves atom placement.
2. **`content.voice.lint`** — deterministic forbidden-phrase lint.
3. **`content.business.validate`** — business schema completeness.
4. **`content.references.validate`** — `{collection.file.field}` resolvability.

The agent provides the inputs by writing two machine-readable artifacts during the author phase:

- `onboarding/.output/04-author/atoms.yaml` — the corpus of identifiable copy fragments with intent tags and source line ranges, written by the agent while it atomizes.
- `onboarding/.output/04-author/voice-profile.yaml` — the agent-parsed brand voice profile from `28-tone-of-voice.md`, merged with biome and family defaults.

Both files live under `.output/` (per-client work product, gone after archive) but are read by validators that live in the kernel (per-ecosystem common gate). This keeps the agent's synthesis judgment in the workflow while still letting CI fail on missed coverage.

## Architectural fit

- **DNA-24 / RFC-0026.** Pages remain frontmatter-only with `blocks[].type` archetype names; this RFC's validators read those files.
- **RFC-0042 NEED*THIS*\* markers.** Synthesis fills missing required strings with `NEED_THIS_<FIELD>`. `content.business.validate` and `content.coverage.validate` both surface these.
- **RFC-0045 references.** `content.references.validate` is the first-class enforcement of that contract.
- **RFC-0047 CMS surface.** Validators read only from the five client-editable domains; nothing outside `pages/`, `prose/`, `business/`, `navigation/`, `site/` is in scope.
- **RFC-0070 onboarding.** Validators are gates inside `APPS_CHECK_PIPELINE`. They run on every app build, not only during onboarding. After a client is archived and `.output/` is gone, `content.coverage.validate` becomes a no-op for that app.
- **RFC-0071 biome.** Voice lint reads `biome.constraints.forbidPhrases` and merges them with the per-client voice profile.

## Design

### Atoms artifact (agent-written)

```yaml
# onboarding/.output/04-author/atoms.yaml
client: warpgogol-handwerk
language: de
materialsHash: sha256:9af3...
generatedAt: 2026-05-18T00:11:18Z
atoms:
  - id: atom-0001
    sourceId: 29-conversion-texts
    sourceLines: [12, 14]
    intent: heading
    pageHint: home
    sectionHint: hero
    text: "Tragfähige digitale Basis für kleine Betriebe und Handwerker."
  - id: atom-0117
    sourceId: 33-faq
    sourceLines: [42, 50]
    intent: faq-answer
    pageHint: faq
    sectionHint: faq-list
    faqQuestion: "Warum 70 €/Monat?"
    text: "Weil die laufende Pflege..."
  # ... typically 300-600 atoms for a 16-page client site
```

Intent enum (closed): `heading | subheading | body | lead | cta-primary | cta-secondary | trust | proof | stat-value | stat-label | faq-question | faq-answer | meta-title | meta-description | og-title | og-description | legal-prose | process-step | comparison-row | microcopy | error-message | confirmation | placeholder | consent`.

### `content.coverage.validate`

For every `apps/<id>/`:

- Loads `onboarding/.output/04-author/atoms.yaml` (no-op if absent).
- Loads every `src/content/pages/{lang}/*.md` (frontmatter-only block-declarative).
- Loads every `src/content/prose/{lang}/*.md`.
- For each atom, searches for its `text` (normalized whitespace, case-insensitive) inside the union of (page `blocks[].props` string values + prose markdown body + business schema string values).
- Cross-checks the agent-written `coverage.md` for unplaced atoms with rationale.

Failure conditions:

- An atom is unplaced and no rationale is recorded in `onboarding/.output/04-author/coverage.md` → fail.
- An atom is marked unplaced with a reason not in the closed enum (`legal-deferred | redundant | out-of-scope-for-mvp | client-deprecated | quality-concern`) → fail.

`onboarding/.output/04-author/coverage.md` is the human-readable companion the agent writes alongside placement:

```markdown
# Author coverage — warpgogol-handwerk

- Total atoms: 487
- Placed: 472
- Unplaced (declared): 15

## Unplaced atoms

- atom-0214 · reason: legal-deferred · note: AGB text — final legal review pending.
- atom-0301 · reason: redundant · note: Duplicate of atom-0188 with minor wording variation.
- atom-0357 · reason: out-of-scope-for-mvp · note: Process detail belongs to a future "how-we-work" page.
…
```

The validator parses this markdown with a small grammar (one bullet per unplaced atom; `atomId · reason: <reason> · note: <free text>`).

### `content.voice.lint`

For every `apps/<id>/`:

- Loads `onboarding/.output/04-author/voice-profile.yaml` (the per-client merged voice profile).
- Merges in `packages/ontology/biomes/<biome>.yaml constraints.forbidPhrases` and `packages/ontology/site-families/<family>/tone-of-voice.template.yaml`.
- Scans every string in `src/content/pages/{lang}/*.md` block props + every `src/content/prose/{lang}/*.md` body + every `src/content/site/{lang}/labels.md` + every `src/content/navigation/{lang}/navigation.md`.
- Reports findings at `error` for forbidden phrases, `warn` for preferred-phrasing replacements.

Voice profile shape:

```yaml
# onboarding/.output/04-author/voice-profile.yaml
client: warpgogol-handwerk
language: de
register: "Sie"                     # Sie | Du | you | informal
forbiddenPhrases:
  - "günstig"
  - "von 1 €/Tag"
  - "Ergebnis garantiert"
  - "100% Erfolg"
preferredPhrasings:
  - { avoid: "Sie bekommen", prefer: "Sie erhalten" }
mandatoryPhrases:
  - "Notausgang"                    # must appear at least once on the home page
allowedQuotes: ["{{quote}}…{{/quote}}"]
```

The agent assembles this file by parsing `28-tone-of-voice.md` and the family template. The kernel does not parse `28-tone-of-voice.md` directly — that is prompt work — but it does enforce the resulting profile.

`mandatoryPhrases` enforcement: a missing mandatory phrase across the entire site is `error`; missing on a specific page declared as required is `error`; missing on optional pages is `warn`.

### `content.business.validate`

For every `apps/<id>/`:

- Loads every `src/content/business/{lang}/*.md` and validates against the `@gogol/business` schemas (`companyBusinessSchema`, `contactBusinessSchema`, `legalBusinessSchema`, `webBusinessSchema`, `locationBusinessSchema`, `complianceBusinessSchema`, `externalServicesBusinessSchema`, plus per-entry repeatables).
- Cross-checks that the default language directory exists (RFC-0008 fallback anchor).
- Detects `NEED_THIS_*` markers and reports each as a `warn` finding with file + line (RFC-0042) — not an error, because markers are an explicit declaration of incomplete data.

This complements (does not replace) the existing `business.profile.validate`; the difference is that this validator reports `NEED_THIS_*` markers as a first-class outcome the agent can act on, and it cross-checks defaults across all supported languages.

### `content.references.validate`

For every `apps/<id>/`:

- Walks every `.md` file under `src/content/**`.
- Extracts every `{collection.file.field}` reference using the RFC-0045 grammar.
- Resolves each reference against the content collection layer.
- Reports findings: unknown collection → `error`; unknown file in collection → `error`; unknown field path → `error`; circular reference → `error`; type mismatch (reference expected string but resolves to object) → `error`.

Output uses the shared envelope; findings include the reference text, file, and line.

### CLI surface — one command, one purpose

```sh
# Each validator: one purpose, app-scoped.
pnpm exec werkstatt run content.coverage.validate --app warpgogol-handwerk
pnpm exec werkstatt run content.voice.lint        --app warpgogol-handwerk
pnpm exec werkstatt run content.business.validate --app warpgogol-handwerk
pnpm exec werkstatt run content.references.validate --app warpgogol-handwerk
```

All four also support `--all` to iterate over every app in `apps/`.

### TypeScript contracts

```ts
// packages/share/src/content-discipline/types.ts
export type ContentAtomIntent =
  | "heading" | "subheading" | "body" | "lead"
  | "cta-primary" | "cta-secondary"
  | "trust" | "proof"
  | "stat-value" | "stat-label"
  | "faq-question" | "faq-answer"
  | "meta-title" | "meta-description" | "og-title" | "og-description"
  | "legal-prose"
  | "process-step" | "comparison-row"
  | "microcopy" | "error-message" | "confirmation" | "placeholder" | "consent";

export const ContentAtom = z.object({
  id: z.string().regex(/^atom-\d{4,}$/),
  sourceId: z.string(),
  sourceLines: z.tuple([z.number(), z.number()]),
  intent: z.enum([/* ContentAtomIntent values */]),
  pageHint: z.string(),
  sectionHint: z.string(),
  faqQuestion: z.string().optional(),
  text: z.string().min(1),
}).strict();

export type UnplacedReason =
  | "legal-deferred" | "redundant" | "out-of-scope-for-mvp"
  | "client-deprecated" | "quality-concern";

export const VoiceProfile = z.object({
  client: z.string(),
  language: z.string(),
  register: z.enum(["Sie", "Du", "you", "informal"]),
  forbiddenPhrases: z.array(z.string()),
  preferredPhrasings: z.array(z.object({ avoid: z.string(), prefer: z.string() })),
  mandatoryPhrases: z.array(z.string()).optional(),
  allowedQuotes: z.array(z.string()).optional(),
}).strict();
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `onboarding/.output/04-author/atoms.yaml` | Agent-written corpus of identifiable atoms with stable ids. |
| `onboarding/.output/04-author/coverage.md` | Agent-written placement ledger + unplaced declarations. |
| `onboarding/.output/04-author/voice-profile.yaml` | Agent-merged per-client voice profile. |
| `apps/<id>/src/content/pages/{lang}/*.md` | Scanned by `content.coverage.validate`, `content.voice.lint`, `content.references.validate`. |
| `apps/<id>/src/content/prose/{lang}/*.md` | Same. |
| `apps/<id>/src/content/business/{lang}/*.md` | Scanned by `content.business.validate`, `content.references.validate`. |
| `apps/<id>/src/content/navigation/{lang}/navigation.md`, `site/{lang}/labels.md` | Scanned by `content.voice.lint`, `content.references.validate`. |
| `packages/share/src/content-discipline/**` | Types + helpers (atom parser, reference grammar). |
| `packages/os/site-kernel-checks/src/{content-coverage,content-voice,content-business,content-references}.ts` | The four validators. |

### Failure modes

- `atoms.yaml` has duplicate ids → `content.coverage.validate` fails before doing any matching.
- An atom's `text` is not found anywhere in the synthesized content and no rationale is in `coverage.md` → fail.
- A forbidden phrase appears in any string the lint scans (excluding allowed-quote wrappers) → fail.
- A business YAML is missing a required field with no `NEED_THIS_*` marker → fail.
- A `{collection.file.field}` reference does not resolve → fail; the diagnostic includes the file, line, and the part of the path that broke (collection / file / field).

## Rollout

1. Add the four validators to `packages/os/site-kernel-checks`.
2. Add `ContentAtom`, `VoiceProfile`, `UnplacedReason`, the atom/coverage/voice-profile parsers to `@gogol/share/content-discipline/`.
3. Register each command workspace-scoped; each is app-scoped at execution.
4. Append to `APPS_CHECK_PIPELINE` (RFC-0075) in this order: `content.business.validate`, `content.references.validate`, `content.voice.lint`, `content.coverage.validate`.
5. Initial roll-out: all four start as `error`. The agent is expected to produce the `.output/04-author/*` files before triggering `apps-check.run` on a freshly authored site.
6. `apps/nicaragua-projekt` does **not** require `atoms.yaml` retroactively — `content.coverage.validate` is a no-op when no `.output/04-author/atoms.yaml` exists for that app.

## Alternatives considered

- **Embed atomization logic in TypeScript.** Rejected — atomization is LLM judgment; gating that in code adds ceremony without value.
- **Skip the coverage gate.** Rejected — sentences silently dropping is the single most expensive QA failure today.
- **Use one mega-validator `content.validate`.** Rejected — single-purpose commands match the ecosystem convention and surface findings cleanly.

## Risks

- **Atom-text matching false negatives.** A synthesized prop rewrites an atom for grammar; the validator does not recognize it. Mitigated by the agent recording such rewrites in `coverage.md` with reason `redundant` (the original atom is considered placed via its rewrite) or by passing a `paraphraseOf:` field on the atom. Initial behavior: exact-after-normalization match; richer matching is a future extension.
- **Voice lint false positives.** A forbidden phrase appears inside a legitimate quotation. Mitigated by `{{quote}}…{{/quote}}` wrapper markup in atoms and prose; the lint skips wrapped content.
- **Business data leakage into prose.** Mitigated by `content.business.validate` scanning prose for IBAN/BIC/Steuernummer patterns; matches fail the build with a hint to move them into business YAMLs.

## Acceptance criteria

- [x] `ContentAtom`, `VoiceProfile`, `UnplacedReason` Zod types in `@gogol/share/content-discipline/`. (evidence: packages/ directory, package exists)
- [x] Four commands registered workspace-scoped; each runs per-app. (evidence: implemented historically)
- [x] All four added to `APPS_CHECK_PIPELINE` (RFC-0075). (evidence: implemented historically)
- [x] `apps/AGENTS.md` updated to clarify that `src/content/pages/{lang}/*.md` are regenerated by the workflow's author phase, while `src/content/prose/{lang}/*.md` are appendable after author. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST write `onboarding/.output/04-author/atoms.yaml`, `voice-profile.yaml`, and `coverage.md` during the author phase. Without these, the validators are no-ops and the gate is effectively absent.
- Agents MUST NOT invent atom text that has no source line range. Every atom traces to a `.input/` file by `sourceId` + `sourceLines`.
- Agents MUST mark every unplaced atom with a reason from the closed enum. If no enum value applies, fix the synthesis instead.
- Agents MUST NOT hard-code business data (IBAN, address, phone) into prose. Use `{business.<file>.<field>}` references.
- Agents MUST treat `NEED_THIS_*` markers as visible work items — surface them in the handoff summary to the human.
- Agents MUST NOT add a new intent value to the closed enum on the fly. Open a successor RFC.
