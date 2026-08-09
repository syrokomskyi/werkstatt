---
title: Service Metadata Block
archetype: service-metadata-block
cosmicName: Sedna
bodyKind: composite
---

# Service Metadata Block

RFC-0759 page-level metadata footer. Drop the following block into a page's `blocks: [...]` list:

```yaml
- id: service-metadata-block
  type: service-metadata-block
  props:
    header:
      heading: "Service metadata"
      subheading: "Last updated 2026-08-08"
    tone: muted
    background:
      kind: color
    version: "1.0"
    effectiveDate: "2026-08-08"
    nextReviewDate: "2027-08-08"
    links:
      - label: "Imprint"
        href: "/imprint"
        rel: "noopener"
      - label: "Privacy policy"
        href: "/privacy"
        rel: "noopener"
      - label: "Terms of service"
        href: "/agb"
        rel: "noopener"
    footnote: "These recommendations are reviewed annually. Last review conducted by the editorial team."
```
