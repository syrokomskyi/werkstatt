---
id: RFC-0112
title: "section.scaffold per-bodyKind templates and canonical fragment output"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0072
  - RFC-0093
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0106
  - RFC-0107
  - RFC-0108
  - RFC-0110
  - RFC-0111
commands:
  proposed: []
  added: []
  changed:
    - section.scaffold
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-codegen
successSignals:
  - "section.scaffold emits a section folder whose .astro is a thin <SectionShell> + <SectionHeader> + matching <SectionBody-{kind}> dispatcher."
  - "section.scaffold emits a manifest with propsSchemaCompose referencing the catalog ids matching the chosen bodyKind, with no inline duplicate JSON Schema."
  - "section.scaffold emits an archetype YAML with bodyKind declared and propsSchema.compose listing the same fragments."
  - "A scaffolded section passes every RFC-0111 validator out of the box."
nonGoals:
  - "Do not generate composite section starters (hero / hero-decision-card / etc.); they remain hand-authored."
  - "Do not duplicate body component logic in the scaffold output — body components live in @gogol/ui."
  - "Do not emit boilerplate CSS for content that the body component already styles."
---

# RFC-0112: section.scaffold per-bodyKind templates and canonical fragment output

## Context

`section.scaffold` (`packages/os/site-kernel-codegen/src/section-scaffold.ts`) is the only sanctioned path for materialising a new section. Today its template emits a starter that uses the legacy patterns: a raw `<section>` root, inline JSON Schema in the manifest, a hand-crafted props schema in the archetype. After RFC-0101..RFC-0107, scaffolded sections immediately fail every contract validator.

## Problem

1. **Scaffold lags the contract.** New sections start non-compliant; the agent must rewrite the starter before running validators.
2. **No per-bodyKind branching.** The current template is a single shape regardless of whether the archetype is `list / cards / stats / etc.`
3. **Manifest duplication.** Scaffolded manifests embed the same 50-line JSON Schema that RFC-0110 already extracted to fragments.
4. **`section.body.contract.validate` (RFC-0111) breaks** every fresh scaffold by design unless the scaffold itself uses the canonical primitives.

## Decision

Update `section.scaffold` to emit per-`bodyKind` templates. The agent supplies (or `cosmic.name.pick` derives) the archetype id; the scaffold reads the archetype's `bodyKind` and selects the matching template.

### CLI surface (unchanged)

```sh
pnpm exec werkstatt run section.scaffold \
  --archetype <id> \
  --slug <slug>
```

### Template selection

```
templates/section/
  shell.astro.template            # the SectionShell wrapper (common to all)
  list.astro.template             # body.kind: list dispatcher
  split-list.astro.template       # body.kind: split-list dispatcher
  stats.astro.template            # body.kind: stats dispatcher
  cards.astro.template            # body.kind: cards dispatcher
  paragraphs.astro.template       # body.kind: paragraphs dispatcher
  comparison.astro.template       # body.kind: comparison dispatcher
  rich.astro.template             # body.kind: rich dispatcher
  composite.astro.template        # composite placeholder + agent prompt
  manifest.yaml.template          # propsSchemaCompose driven by bodyKind
  archetype.yaml.template         # archetype YAML driven by bodyKind
  types.ts.template               # types.ts referencing the matching SectionXBody
  css.template                    # empty (content-only) css with comment
  story.md.template               # one realistic body example per bodyKind
```

### Manifest template

```yaml
id: {{slug}}-section
uniName: {{slug}}-section
layer: section
semanticId: {{slug}}
archetype: {{archetypeId}}
cosmicName: {{cosmicName}}
role: {{role}}
version: 1.0.0
intent:
  - {{intent}}
industryFit: []
contentSchemaKey: {{slug}}-section
contentTypesPath: ./{{slug}}-section.types.ts

propsSchemaCompose:
  - section-visual
  - section-header
  - body-{{bodyKind}}              # omitted when bodyKind == composite

propsSchema:
  type: object
  additionalProperties: false
  required:
    - header
    - body                          # omitted when bodyKind == composite
```

### Archetype template

```yaml
id: {{archetypeId}}
displayName: "{{displayName}}"
version: 1.0.0
semanticRole: {{semanticRole}}
description: |
  {{description}}
expectedIntents:
  - {{intent}}
expectedIndustryFit: []
layoutHint: {{layoutHint}}
bodyKind: {{bodyKind}}
propsSchema:
  $shape: zod
  compose:
    - section-visual
    - section-header
    - body-{{bodyKind}}              # omitted when bodyKind == composite
acceptedCosmicNames:
  - {{cosmicName}}
constraints: {}
```

### types.ts template

```ts
import type {
  SectionBackground, GlassConfig, SectionDensity, SectionTone,
  SectionHeaderProps, Section{{BodyKindPascal}}Body,
} from "@gogol/share";

export interface {{SlugPascal}}SectionContent {
  background?: SectionBackground;
  glass?: GlassConfig;
  density?: SectionDensity;
  tone?: SectionTone;
  header: Omit<SectionHeaderProps, "sectionNumber" | "id">;
  body: Section{{BodyKindPascal}}Body;
}
```

### .astro template (list example)

```astro
---
/* RFC-0103: {{slug}} thin dispatcher — {{bodyKind}} body. */

import type { SectionProps } from "@gogol/share";
import { cast, need, resolveSectionAnchor } from "@gogol/share";
import SectionShell from "@gogol/ui/components/section-shell.astro";
import SectionHeader from "@gogol/ui/components/section-header.astro";
import SectionList from "@gogol/ui/components/section-body/list.astro";
import type { {{SlugPascal}}SectionContent } from "./{{slug}}-section.types";

const { lang, sectionNumber, pageOverride } = Astro.props as SectionProps;
const sectionId = await resolveSectionAnchor(Astro.props, "{{slug}}");
const props = cast<{{SlugPascal}}SectionContent>(pageOverride);
const body = need("body", props.body);
---

<SectionShell
  slug="{{slug}}"
  sectionId={sectionId}
  ariaLabelledBy="{{slug}}-title"
  background={props.background}
  glass={props.glass}
  density={props.density}
  tone={props.tone}
  lang={lang}
>
  <SectionHeader
    sectionNumber={sectionNumber}
    heading={need("header.heading", props.header?.heading)}
    subheading={props.header?.subheading}
    align={props.header?.align ?? "left"}
    level={props.header?.level ?? 2}
    hideSectionNumber={props.header?.hideSectionNumber}
    id="{{slug}}-title"
  />
  <SectionList
    items={body.items}
    note={body.note}
    iconColor={body.iconColor}
    align={body.align}
  />
</SectionShell>
```

Symmetric templates exist for `split-list`, `stats`, `cards`, `paragraphs`, `comparison`, `rich`.

### story.md template

One realistic content example per `bodyKind`, written in block-style YAML front matter so the scaffold output is immediately useful as a fixture.

## Design

See `## CLI surface`, `## File system responsibilities`, and `## Failure modes` above for the per-bodyKind template structure, scaffold command flags, and output format.

## Architectural fit

- **RFC-0072** — section archetypes drive the scaffold; bodyKind is the branching axis.
- **RFC-0093** — content-aware starter principle preserved; templates emit meaningful authored content, not JSON dumps.
- **RFC-0101..0106** — every scaffold output uses canonical primitives.
- **RFC-0110** — `propsSchemaCompose` is the only mechanism the scaffold uses for visual / header / body schema.
- **RFC-0111** — scaffolded sections pass every contract validator on the first run.

## CLI surface

```sh
pnpm exec werkstatt run section.scaffold \
  --archetype <archetype-id> \
  --slug <slug>
```

Unchanged signature; internally the command:

1. Loads the archetype YAML.
2. Reads `bodyKind`.
3. Picks a free cosmic name via `cosmic.name.pick`.
4. Selects the matching .astro, manifest, archetype, types, and story templates.
5. Renders them with `{{slug}}`, `{{SlugPascal}}`, `{{BodyKindPascal}}`, `{{cosmicName}}`, etc. substitutions.
6. Writes the files atomically.

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-codegen/src/section-scaffold.ts` | Update template loader + branching on `bodyKind`. |
| `packages/os/site-kernel-codegen/src/templates/section/*.template` | New per-bodyKind starter templates. |

## Failure modes

- Archetype lacks `bodyKind` → command exits with a clear error pointing to RFC-0103.
- Archetype declares `bodyKind: composite` but the agent supplies a body template id → command rejects, asks for composite or non-composite mode.
- Cosmic name picker returns no free name → standard recovery rule applies.

## Rollout

Single PR. The legacy template is replaced; the codegen test suite is updated to assert the new structure for every bodyKind. After merge, any `section.scaffold` invocation produces a section that passes RFC-0111 validators out of the box.

## Alternatives considered

- **One mega-template with conditional blocks.** Rejected — the conditional logic is unreadable and brittle compared to separate per-kind templates.
- **Generate body code inline.** Rejected — body rendering belongs to the RFC-0103 body components in `@gogol/ui`; the scaffold must not duplicate it.
- **Skip composite scaffolding.** Rejected — keep `composite.astro.template` as a placeholder + agent prompt; composite archetypes are rare and human- authored anyway.

## Risks

- New body kinds added after this RFC may not have a scaffold template. Mitigation: `section.scaffold` fails explicitly when `--body-kind` is not in the registered catalog.
- Scaffold drift: generated output becomes non-compliant as contracts evolve. Mitigation: `section.contract.validate` gates every section at CI time.

## Acceptance criteria

- [x] `section.scaffold` reads `bodyKind` from the archetype YAML. (evidence: implemented historically)
- [x] One template per `bodyKind` exists under `packages/os/site-kernel-codegen/src/templates/section/`. (evidence: packages/ directory, package exists)
- [x] Scaffolded sections pass every RFC-0111 validator. (evidence: implemented historically)
- [x] At least one golden fixture per `bodyKind` lives under `packages/os/site-kernel-codegen/src/tests/`. (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MUST NOT duplicate body-component rendering logic inside the scaffold templates; templates import body components from `@gogol/ui/components/section-body/*`.
- Agents MUST keep templates aligned with `SHARED_SECTION_PROPS` catalog ids; if a new body fragment lands, the scaffold gains a matching template in the same PR.
