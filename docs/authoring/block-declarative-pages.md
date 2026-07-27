# Block-Declarative Pages

> **Established by:** RFC-0026 · DNA-24 · DNA-25

Every page content file under `apps/*/src/content/pages/` must be a **frontmatter-only block-declarative document**. No markdown body is allowed.

---

## Shape

```yaml
---
kind: page                                 # required literal — identifies block-declarative format
cosmicStar: Vega                           # IAU star name from StarCatalog — must match system.yaml
title: "Startseite | My Site"             # <title> tag and JSON-LD page name
description: "Short page description."   # <meta name="description">
lang: de                                   # BCP-47 language code
blocks:
  - id: hero                               # optional stable kebab-case block id (analytics, anchors)
    use: Europa                            # PlanetName from PlanetCatalog — must be pinned in system.yaml
    props:
      heading: "Bildung für Kinder"
      subheading: "Seit 2008 — jeden Tag."
    visibility:                            # optional — omit means "always show"
      feature: hero-enabled
  - id: impact
    use: Ganymede
    props:
      heading: "Unsere Wirkung"
      ariaLabel: "Projektstatistiken"
      stats:
        - value: "1420"
          label: "Kinder im Programm"
---
```

---

## Rules

### 1. No markdown body

The `.md` file must contain **only** a YAML frontmatter block. If the body after the closing `---` is non-empty, `page.block.validate` and `mirror.quintet.validate` will fail the build.

If a page needs prose, put the prose in `src/content/components/prose/<slug>.<lang>.md` and reference it from a **Hyperion** block:

```yaml
blocks:
  - id: legal-text
    use: Hyperion
    props:
      heading: "Impressum"
      contentRef: "prose/impressum.de"   # → src/content/components/prose/impressum.de.md
```

### 2. `blocks[].use` must be pinned in `system.yaml`

Every planet name in `blocks[].use` must also appear in `system.yaml pages[<route>].planets[]`. Using an unpinned planet fails `page.block.validate`.

```yaml
# system.yaml excerpt
pages:
  - route: /
    cosmicStar: Vega
    planets:
      - { cosmicPlanet: Europa, pin: "1.2.0" }
      - { cosmicPlanet: Ganymede, pin: "1.2.0" }
```

### 3. `blocks[].props` must match the section's propsSchema

Each section's `manifest.yaml` declares a `propsSchema` (JSON Schema). `page.block.validate` runs strict validation (`additionalProperties: false`) — extra keys fail, missing required keys fail.

To see a section's allowed props, inspect its manifest:

```
packages/ui/src/sections/<section-folder>/manifest.yaml
```

### 4. `cosmicStar` must match `system.yaml`

The page's `cosmicStar` value must equal the `cosmicStar` declared for its route in `system.yaml`. Mismatch fails `page.block.validate`.

### 5. Block ids must be unique within a page

Two blocks on the same page may not share an `id`. Duplicates fail `page.block.validate`.

### 6. Breadcrumbs are default navigation

The shared page route pipeline adds a `breadcrumbs` section (`Thebe`) to non-home pages when the page does not already declare one. Standard Home → Current page breadcrumbs should therefore not be duplicated in every page frontmatter file. Declare `type: breadcrumbs` explicitly only for pages that need a custom trail, and keep `Thebe` pinned in `src/content/system.md pages[].planets[]` for pages that expose breadcrumbs.

---

## Visibility expressions

Block-level visibility uses the same grammar as the feature-graph (see [`visibility-expressions.md`](./visibility-expressions.md)). Omit `visibility` to always show a block.

```yaml
blocks:
  - use: Europa
    visibility:
      locale: de          # only shown when lang=de

  - use: Callisto
    visibility:
      all:
        - feature: problem-section-enabled
        - locale: [de, en]

  - use: Ganymede
    # no visibility → always rendered
```

---

## Prose blocks (Hyperion / Markdown section)

When a page needs long-form text (legal pages, donation info, open-source notices):

1. Create the prose content file:

   ```
   apps/<app>/src/content/components/prose/<slug>.<lang>.md
   ```

   The file may have an empty frontmatter (`---` / `---`) or a `# comment` header.

2. Reference it from the page entry:
   ```yaml
   blocks:
     - id: legal-body
       use: Hyperion
       props:
         heading: "Impressum"
         contentRef: "prose/impressum.de"
   ```

The Hyperion section will load and render the prose entry at build time. No `<slot />` is needed in the route.

---

## Common pitfalls

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Markdown body after `---` | `page.block.validate` rule `no-markdown-body` | Move prose to `prose/<slug>.<lang>.md` |
| Unknown planet in `blocks[].use` | `page.block.validate` rule `planet-not-pinned` | Add planet to `system.yaml pages[route].planets[]` |
| Extra key in `blocks[].props` | `page.block.validate` rule `props-extra-key` | Remove the key or update the section's propsSchema |
| Wrong `cosmicStar` | `page.block.validate` rule `star-mismatch` | Match the star in `system.yaml pages[route].cosmicStar` |
| Duplicate block id | `page.block.validate` rule `duplicate-block-id` | Rename one of the ids |

---

## Full example — homepage (DE)

```yaml
---
kind: page
cosmicStar: Vega
title: "Startseite | Nicaragua Projekt e.V."
description: "Das Nicaragua Projekt e.V. unterstützt medizinische und soziale Projekte in Nord-Nicaragua."
lang: de
blocks:
  - id: hero-home
    use: Europa
    props:
      heading: "Gesundheit für alle"
      subheading: "Medizinische Versorgung in abgelegenen Gemeinden."
      tagline: "Seit 2005"
      description: "Das Nicaragua Projekt e.V. betreibt eine mobile Klinik und unterstützt Brigadistas."
      imageAlt: "Mobile Klinik im Einsatz"
      ctaPrimaryLabel: "Jetzt spenden"
      ctaPrimaryAriaLabel: "Jetzt das Nicaragua Projekt spenden"
      ctaSecondaryLabel: "Mehr erfahren"
      ctaSecondaryAriaLabel: "Mehr über das Nicaragua Projekt erfahren"
      stats:
        - value: "10"
          label: "betreute Dörfer"
        - value: "14"
          label: "ausgebildete Brigadistas"
        - value: "seit 2005"
          label: "mobile Klinik im Einsatz"

  - id: impact-home
    use: Ganymede
    props:
      heading: "Unsere Wirkung in Zahlen"
      ariaLabel: "Projektkennzahlen"
      stats:
        - value: "10"
          label: "Dörfer monatlich besucht"
        - value: "14"
          label: "ausgebildete Brigadistas"
        - value: "seit 2005"
          label: "mobile Klinik im Einsatz"

  - id: cta-home
    use: Dione
    props:
      heading: "Unterstützen Sie uns"
      description: "Ihre Spende sichert medizinische Versorgung für Familien in Nicaragua."
      ctaLabel: "Jetzt spenden"
      ctaAriaLabel: "Jetzt das Nicaragua Projekt e.V. spenden"
---
```
