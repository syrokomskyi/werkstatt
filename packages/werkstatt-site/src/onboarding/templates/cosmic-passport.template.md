---
kind: page
pageId: cosmic/passport
cosmicStar: Polaris
title: "Cosmic Passport — {{CLIENT_ID}}"
description: "Build provenance, Nebula Score and architecture overview for {{CLIENT_ID}}."
lang: {{DEFAULT_LANG}}
blocks:
  - id: passport-header
    type: passport-header
    props:
      title: "Cosmic Passport"
      subtitle: "{{CLIENT_ID}}"

  - id: pulsar
    type: pulsar
    props: {}

  - id: passport-score-grid
    type: passport-score-grid
    props: {}

  - id: passport-provenance
    type: passport-provenance
    props:
      showVC: false

  - id: passport-star-map
    type: passport-star-map
    props:
      emitSource: passport-inline
---
