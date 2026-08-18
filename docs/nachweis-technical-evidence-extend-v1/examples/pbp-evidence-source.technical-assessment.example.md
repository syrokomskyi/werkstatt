---
schema: "pbp/evidence-source@1"
id: "evidence-warpgogol-lighthouse-home-example"
type: "evidence-source"
kind: "technical-assessment"
name: "warpgogol.com – Google Lighthouse"
authority:
  kind: "external-tool"
  label: "Google Lighthouse"
items:
  lhr-run-01:
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    storage: "private"
    mediaType: "application/json"
    qualityStatus: "verified"
    role: "raw-result"
    canonical: true
assessment:
  profile: "technical-assessment"
  seriesId: "warpgogol-lighthouse-home"
  observationId: "20260818T070000Z-example"
  subject:
    url: "https://warpgogol.com/"
    canonicalUrl: "https://warpgogol.com/"
  provider:
    id: "google-chrome-lighthouse"
    name: "Google Lighthouse"
  tool:
    id: "lighthouse"
    name: "Lighthouse"
    version: "REPLACE_FROM_ACTUAL_LHR"
  executionMode: "operator-run"
  authorizationBasis: "site-owner"
  observedAt: "2026-08-18T07:00:00Z"
  methodology:
    id: "WG-LH-01"
    version: "1.0"
    runCount: 5
    aggregation: "median"
  dimensions:
    - id: "performance"
      providerLabel: "Performance"
      score: 91
      samples: [89, 90, 91, 92, 93]
      min: 89
      max: 93
  freshness:
    maxAgeDays: 30
---

Example only. The repository's actual PBP frontmatter envelope/authority contract MUST be taken from current schemas and fixtures. The substantive `kind`, `items` artifact semantics and `assessment` object are defined by RFC-TBD-CONTRACT. Do not copy unknown `authority` fields blindly if the live schema differs.
