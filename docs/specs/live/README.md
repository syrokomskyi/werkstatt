# Living Feature Specs

Living feature specs are mutable markdown documents that reflect the **current** specification of a feature or module. Unlike vendored spec snapshots (DNA-55), living specs evolve through delta merges from archived RFCs.

## Purpose

- Single source of truth for feature-level design
- Evolves through multiple RFCs over time
- Replaces the need to read multiple archived RFCs to understand current state

## How living specs are created

1. An RFC declares `liveSpec: true` (auto-derive domain from `packagesImpacted[0]`) or `liveSpec: <domain>` (explicit domain) in its frontmatter.
2. When the RFC is implemented and archived via `docs.archive`, the post-loop `spec.live.merge` step automatically merges the RFC's `## Design` section headings into `docs/specs/live/<domain>.md`.
3. The living spec is created on first merge and modified on subsequent merges.

## Commands

- `spec.live.merge --id <RFC-XXXX>` — merge deltas from an RFC into a living spec
- `spec.live.list` — list all living specs
- `spec.live.show --domain <name>` — show a single living spec
- `spec.live.validate` — validate all living specs (V-LS-01..05)

## Conflict handling

Merges are **all-or-nothing**: if any heading conflict is detected (a heading was last modified by a different RFC), the entire merge is aborted without writing. This prevents silent overwrites of another RFC's design decisions.

## Generated files

Living specs include a `GENERATED` header marker. They are produced by `spec.live.merge` and should not be hand-edited. To update a living spec, implement a new RFC with `liveSpec: <domain>` and run `docs.archive`.
