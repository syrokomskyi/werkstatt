---
# System manifest for apps/{{APP}}
kind: page
pageId: cosmic/starMap
cosmicStar: Polaris
title: "{{TITLE}}"
description: "{{DESCRIPTION}}"
lang: {{LANG}}
blocks:
  - id: passport-header
    type: passport-header
    props: {}
  - id: passport-star-map
    type: passport-star-map
    props:
      hideSectionNumber: true
---
{{GENERATED_HEADER}}
