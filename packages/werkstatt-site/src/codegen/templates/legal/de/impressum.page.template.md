---
kind: page
pageId: impressum
cosmicStar: {{COSMIC_STAR}}
title: "Impressum"
description: "Impressum gemäß § 5 TMG für {{APP_DISPLAY_NAME}}."
lang: de
# RFC-0174: binding-language policy (see datenschutz page template for rationale).
translation:
  binding: de
  bindingDocLabel: "Impressum"
  notice: true
  indicator: true
blocks:
  - id: imprint
    type: markdown
    props:
      contentRef: "prose/impressum"
---
