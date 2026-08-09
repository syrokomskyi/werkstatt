---
# System manifest for apps/{{CLIENT_ID}}
# [DNA-23][RFC-0025][RFC-0047] — Validated by system.manifest.validate
app: {{CLIENT_ID}}
version: 1.0.0

identity:
  systemStar: {{SYSTEM_STAR}}
  biome: {{BIOME_ID}}
  tagline: {{TAGLINE}}

# Site shell — viewport-level surfaces (RFC-0105). The background block is
# seeded from biome.siteBackground (RFC-0114 / RFC-0117 / RFC-0129) and may be
# overridden here or per-page.
{{SHELL_BACKGROUND_YAML}}

# Language configuration (RFC-0038) — content-declared, client-editable.
i18n:
  default: {{DEFAULT_LANG}}
  supported:
    {{DEFAULT_LANG}}:
      name: "{{DEFAULT_LANG}}"
      hreflang: "{{DEFAULT_LANG}}"
      rtl: false

constellations:
  - {{CONSTELLATION_ID}}

# Content surfaces the client may edit without engineering involvement (DNA-22).
# Each key resolves to a path under src/content/.
clientEditable:
  - pages
  - prose
  - business
  - navigation
  - site

sharedContext:
  requiredPageIds:
    - home

# Per-page section composition pins (RFC-0026, RFC-0048).
# blocks[].type in page content resolves to cosmicPlanet entries here.
# Each page has a stable pageId and language-keyed routes (RFC-0048).
pages:
  - pageId: home
    semanticType: home
    # RFC-0143: per-page output projection. `output.sitemap` controls sitemap
    # inclusion/layout; `output.llms` controls llms.txt/llms-full.txt depth.
    output:
      sitemap: { category: content, lastmod: "2026-01-01", includeLastmod: false }
    routes:
      {{DEFAULT_LANG}}: ""
    cosmicStar: {{SYSTEM_STAR}}
    constellation: {{CONSTELLATION_ID}}
    planets: []

  - pageId: legalNotice
    semanticType: legal
    routes:
      {{DEFAULT_LANG}}: legal-notice
    cosmicStar: Polaris
    planets:
      - { cosmicPlanet: Hyperion, pin: "1.0.0" }

  - pageId: cosmic/passport
    routes:
      {{DEFAULT_LANG}}: cosmic/passport
    output:
      sitemap: false
    cosmicStar: Polaris
    planets:
      - { cosmicPlanet: Methone,  pin: "1.0.0" }
      - { cosmicPlanet: Despina,  pin: "1.0.0" }
      - { cosmicPlanet: Klarissa, pin: "1.0.0" }
      - { cosmicPlanet: Bianca,   pin: "1.0.0" }
      - { cosmicPlanet: Adrastea, pin: "1.0.0" }

  - pageId: cosmic/starMap
    routes:
      {{DEFAULT_LANG}}: cosmic/star-map
    output:
      sitemap: false
    cosmicStar: Polaris
    planets:
      - { cosmicPlanet: Methone,  pin: "1.0.0" }
      - { cosmicPlanet: Adrastea, pin: "1.0.0" }

# Growth layer binding (RFC-0027 / DNA-27..30).
# Activates the vendor-agnostic growth layer: Null adapter.
growth:
  vendor:
    adapter: "null"
    options: {}
  funnels: []
  experiments: []

# Release configuration (RFC-0028 / DNA-31..34).
# Enables Cosmic Passport, Star Map, and Nebula Score pipeline.
release:
  passport:
    enabled: true
    indexable: true
    keyVersion: v1
    heartbeatUrl: https://{{DOMAIN}}/.well-known/cosmic-passport.json
---

# System Configuration

This file serves as the canonical system manifest for the {{CLIENT_ID}} application.

## Content Structure (RFC-0047)

- **pages/**: Visitor-facing page content with language subdirectories
- **prose/**: Editorial content, blog posts, articles with language subdirectories
- **business/**: Business-specific content (services, products, case studies) with language subdirectories
- **navigation/**: Navigation structure and menus with language subdirectories
- **site/**: Site-wide content (labels, metadata, shell content) with language subdirectories

Each content domain supports localized assets/** subdirectories for content-owned media files.

## Next Steps

1. Update page composition in the `pages` section above
2. Add content files to the appropriate domains under `src/content/`
3. Configure navigation in `src/content/navigation/{{DEFAULT_LANG}}/`
4. Add site-wide labels and metadata in `src/content/site/{{DEFAULT_LANG}}/`
