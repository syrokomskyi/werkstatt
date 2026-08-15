# Packet 040 Preparation Evidence

## Date

2026-08-15

## Actor

agent:windsurf (Executor)

## Governing decision

werkstatt-release-certification/AMD-007

## Normative source

- `docs/specs/werkstatt-release-certification/amendments/amd-007-component-runtime-reconciliation.md`
- SHA-256: `ca12287a3dee5e07e2eb744c400015253f08f1767c399f94ebdd01895367ccb6`

## Predecessor completion

- Packet 030-canonical-diagnostic completed at `b82f2f75ad5361115a4cfa970a49eebe72abfe73`

## Current code facts

- AMD-007 exists at the declared path with the declared SHA-256.
- `forge-spec.yaml` has 10 CERT RFC nodes, 20 ADR decisions, and 4 waves.
- `spec.validate` passes before changes.
- `integrity.yaml` excludes `forge-spec.yaml` and `amendments/` from the snapshot manifest, so modifying these files does not trigger SPEC-01 violations.
- AMD-007 targets three sections: `overview#target-architecture`, `contracts#candidate-identity`, `roadmap#implementation-roadmap`.
- The `forbiddenFiles` list prevents modifying `docs/specs/werkstatt-release-certification/*.md` (the spec documents themselves). The amendment is applied at read time; the spec documents are updated by later packets that have write access.

## Changes

1. **Accept AMD-007**: changed `status: proposed` to `status: accepted`, added `reviewers: [human:andrii-syrokomskyi]`.
2. **Update `forge-spec.yaml`**: annotated CERT-002 and CERT-009 titles to reflect AMD-007's resolved-component-set identity and combined cutover semantics.
3. **This preparation evidence file**: records the preparation boundary.

## Validation plan

- `pnpm --filter @warpgogol/werkstatt test` — must pass
- `pnpm --filter @warpgogol/werkstatt build` — must pass
- `pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification` — must pass
