---
title: Credits Gallery
archetype: credits
cosmicName: Makemake
bodyKind: composite
---

# Credits Gallery

RFC-0232 material credits page rendered as an optimized media gallery. The section reads every `*.credits.yaml` sidecar (RFC-0220), resolves each preview from `credit.target.id` + `credit.target.domain` (RFC-0053 language fallback), and renders a responsive image or living-photo / feature video beside the provenance details. No media filename is authored; no HTML is authored in content. This block is generator-owned (`material.credits.generate`).

```yaml
- id: credits-content
  type: credits
  props:
    heading: "Bildnachweise"
    background:
      kind: color
```
