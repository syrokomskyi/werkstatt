# Performance Evidence — warpgogol.com

Visual evidence screenshots for Lighthouse and Cloudflare Agent Readiness observations.

## 2026-08-18

### Lighthouse

- Screenshot: `Lighthouse Screenshot From 2026-08-18 09-04-02.png`
- URL: https://warpgogol.com
- Scores: Performance 100, Accessibility 100, Best Practices 100, SEO 100
- Canonical pipeline: `nachweis.measure.lighthouse --system warpgogol-com --url https://warpgogol.com --runs 5` (bordbuch event-000242, Lighthouse 12.8.2)
- Nachweis slug: `lighthouse-wg-lh-01` (N3, published)

### Cloudflare Agent Readiness

- Screenshot: `Agent-Ready Screenshot From 2026-08-18 09-04-52.png`
- URL: https://warpgogol.com
- Canonical pipeline: `nachweis.measure.cloudflare-agent-readiness --system warpgogol-com --url https://warpgogol.com` (bordbuch event-000247)
- Nachweis slug: `cloudflare-cf-ar-01` (N3, published)

## Notes

Screenshots are visual evidence for the operator. Canonical Nachweis data comes from the pipeline (5 canonical Lighthouse LHR runs, Cloudflare URL Scanner API). Screenshot values are not seeded into Nachweis records (RFC-0876 acceptance criteria 13–14).
