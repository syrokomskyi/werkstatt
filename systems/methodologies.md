---
instruments:
  - id: accessibility-axe
    type: accessibility
    params:
      axeVersion: "4.12.1"
  - id: runtime-health-browser
    type: runtime-health
    params: {}
  - id: seo-runtime
    type: seo-runtime
    params: {}
  - id: security-headers-http
    type: security-headers
    params: {}
  - id: performance-vitals
    type: performance-vitals
    params:
      lcpThreshold: 2500
      clsThreshold: 0.1
      inpThreshold: 200
  - id: visual-regression
    type: visual-regression
    params:
      diffThreshold: 0.1
  - id: privacy-consent
    type: privacy-consent
    params: {}
  - id: multilingual-consistency
    type: multilingual-consistency
    params: {}

methodologies:
  - id: automated-web-accessibility
    instrument: accessibility-axe
    active: true
    blockOn: [high, critical]
  - id: multilingual-content-consistency
    instrument: multilingual-consistency
    active: true
    blockOn: [high, critical]
  - id: runtime-functional-health
    instrument: runtime-health-browser
    active: true
    blockOn: [critical]
  - id: privacy-consent-compliance
    instrument: privacy-consent
    active: false
    blockOn: [high, critical]
  - id: seo-technical-runtime
    instrument: seo-runtime
    active: true
    blockOn: [high, critical]
  - id: security-headers
    instrument: security-headers-http
    active: true
    blockOn: [high, critical]
  - id: performance-vitals
    instrument: performance-vitals
    active: true
    blockOn: [critical]
  - id: visual-regression
    instrument: visual-regression
    active: false
    blockOn: [critical]

gate:
  aggregation: all-must-pass
  allowIncomplete: true
  requireEvidence: true
  minCoverage: 1.0
---

# Workshop Methodologies

This file configures which Axiom methodologies are active for the Werkstatt and how their results are aggregated into the deployment gate for `alt` channel.

## Adding a methodology

Uncomment the methodology in the `methodologies` section and set `active: true`. Adjust `blockOn` to control which severity levels block `leitstand.propagate`.

## Disabling a methodology

Set `active: false` or comment out the entry. Inactive methodologies are skipped by `mission.check` and do not contribute to the gate decision.
