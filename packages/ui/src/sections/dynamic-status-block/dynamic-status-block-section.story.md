---
title: Dynamic Status Block
archetype: dynamic-status-block
cosmicName: Elara
bodyKind: composite
---

# Dynamic Status Block

RFC-0072 + RFC-0103 starter for archetype `dynamic-status-block`. Drop the following block into a page's `blocks: [...]` list:

```yaml
- id: dynamic-status-block
  type: dynamic-status-block
  props:
    header:
      heading: "Відповідальні рекомендації"
      subheading: "Станом на останнє оновлення"
    value: 1
    label: "Відкритих мандатів"
    valueTone: success
    animated: true
    background:
      kind: color
```
