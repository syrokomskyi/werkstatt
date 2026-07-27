# AGENTS — @warpgogol/site-kernel-audit

Delta-scoped audit package for the amend chain (RFC-0136).

## Invariants

- `audit.delta.run` MUST run the RFC-0074 audit validators over the **whole app** (so regressions on untouched pages are caught) while reporting against the **batch delta** (touched pages + new routes). The delta narrows what is authored-against, not what regressions are detected.
- Dispatch other validators by name via `executeKernelCommand`. Do NOT import validator handlers directly — keep this package's dependency surface minimal (`@warpgogol/site-kernel` only).
- New-route batches additionally run the full structured-data / technical / agent- readiness surface; strengthen-only batches run the content-scoped subset.
- Registration of the command lives in `@warpgogol/site-kernel-checks`, not here.
