---
schema: pbp/business@1
id: https://{{DOMAIN}}/id/business
type: business
status: draft
name: "{{APP_DISPLAY_NAME}}"
summary: "{{APP_DISPLAY_NAME}}"
description: >-
  {{APP_DISPLAY_NAME}}
mission: >-
  {{APP_DISPLAY_NAME}}
businessModel:
  typeRef: founder-led-engineering-studio
markets:
  b2b:
    valueRef: b2b
yearEstablished: ""
brandRefs:
  primary:
    ref: https://{{DOMAIN}}/id/brand
    expectedType: brand
legalIdentityRef:
  ref: https://{{DOMAIN}}/id/legal-identity
  expectedType: legal-identity
---
