---
kind: page
pageId: datenschutz
cosmicStar: {{COSMIC_STAR}}
title: "Datenschutz"
description: "Datenschutzerklärung gemäß DSGVO für {{APP_DISPLAY_NAME}}."
lang: de
# RFC-0174: binding-language policy. German is the only legally binding version;
# non-binding renders carry the mandatory notice + "unofficial translation"
# indicator. Set a locale to `disabled` to fall back to the German document.
translation:
  binding: de
  bindingDocLabel: "Datenschutzerklärung"
  notice: true
  indicator: true
blocks:
  - id: privacy
    type: markdown
    props:
      contentRef: "prose/datenschutz"
---
