---
# System manifest for apps/{{APP}}
kind: page
pageId: cosmic/passport
cosmicStar: Polaris
title: "{{TITLE}}"
description: "{{DESCRIPTION}}"
lang: {{LANG}}
blocks:
  - id: passport-header
    type: passport-header
    props:
      hideSectionNumber: true
  - id: pulsar
    type: pulsar
    props:
      hideSectionNumber: true
  - id: passport-score-grid
    type: passport-score-grid
    props:
      hideSectionNumber: true
  - id: passport-provenance
    type: passport-provenance
    props:
      hideSectionNumber: true
  - id: passport-star-map
    type: passport-star-map
    props:
      hideSectionNumber: true
---
{{GENERATED_HEADER}}
