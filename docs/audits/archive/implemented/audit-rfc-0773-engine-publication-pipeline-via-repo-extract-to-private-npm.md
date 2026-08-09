---
rfcId: RFC-0773
auditId: AUDIT-RFC-0773-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0773

## Verdict: Needs revision

The RFC is a well-scoped policy document that correctly follows the forge extraction precedent. However, it references DNA-62 in its body without declaring it in `satisfies[]`, omits npm token management from its security model, and does not distinguish agent-executable acceptance criteria from operator-only steps (actual npm publication).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1 (minor):** No explicit file-system responsibilities table. Concrete paths are mentioned inline in the Design section (`packages/<name>/extract.config.yaml`, `.forge/pinned.yaml`, engine README, `docs/authoring/`), but a structured table would improve agent traceability.
- **A-2 (minor):** Failure modes section specifies "abort publication" but does not define what abort means concretely for a runbook step (non-zero exit from the publication script? manual intervention?). Since this is a policy RFC with no kernel commands, exit codes are not applicable, but the runbook should specify the concrete abort action.

## Axis B — DNA alignment

- **B-1 (finding):** The RFC body states "DNA-62 (pinned files) — extract.config.yaml files join .forge/pinned.yaml (protect mode) so they cannot be silently deleted." This is a claim to extend DNA-62 (Foundation File Integrity), but `satisfies: []` is empty. For policy RFCs, `satisfies` is not required by V-28, but if the RFC body claims to extend a DNA invariant, it should declare it. Add `satisfies: [DNA-62]`.

## Axis C — Ecosystem fit

- **C-1 (finding):** The RFC does not identify which `docs/*.xml` Compass documents need synchronization. A new publication pipeline is a technology-level addition; `docs/technology.xml` should gain an entry for the repo-extract-based private npm publication model.
- **C-2 (finding):** The RFC does not mention AGENTS.md updates for agent-facing publication rules. The nonGoals say "No automated publish-on-merge — publication stays operator-triggered", but this rule should be documented in AGENTS.md so agents know they MUST NOT trigger npm publication without an explicit operator command.

## Axis D — Forward-only compliance

No issues. The RFC explicitly rejects compatibility shims (nonGoals: "No public npm publication", "No automated publish-on-merge"). No dual-paths, no legacy maintenance.

## Axis E — Agent-facing policy

- **E-1 (finding):** Acceptance criterion "Publication runbook written and verified end-to-end once (dry-run → extract → build → pack → scratch install → publish)" requires actual npm publication, which is an operator-only action (requires npm token, private registry access, network access to npm). The RFC should distinguish between agent-executable steps (create `extract.config.yaml` files, pin them in `.forge/pinned.yaml`, write the runbook document) and operator-executable steps (actual `npm publish`, token setup). Without this distinction, an agent may attempt to run `npm publish` during implementation.

## Axis F — Pragmatism

- **F-1 (minor):** `packagesImpacted: []` is empty, but the RFC body explicitly names `packages/werkstatt`, `packages/werkstatt-site`, `packages/werkstatt-game`, `packages/werkstatt-video` as targets for extraction configs. These packages do not exist yet (created by RFC-0772), and the comment says "Leave empty if unknown", but the RFC does know — listing them would improve traceability.

## Axis G — Blind spots

- **G-1 (finding):** The RFC mentions `.npmrc` with an npm token (Private access section) but does not address token management: where the token is stored (environment variable? `.npmrc` in the extraction folder?), how it is rotated, and how it is protected from accidental commitment to git or extraction by repo-extract. The forge precedent (`packages/forge/extract.config.yaml`) uses `excludePathSegments: [".npmrc"]` — the RFC should reference this pattern and mandate it for all extraction configs.
- **G-2 (minor):** No rollback path described if the first publication succeeds but the published package is broken. npm unpublish is time-limited (72h for new packages); deprecation is the forward-only option. The runbook should address this scenario.

## Questions for the author

1. Should `satisfies: [DNA-62]` be declared, given that the RFC extends the pinned-files manifest with `extract.config.yaml` entries?
2. Where is the `@warpgogol` scope npm token stored, and how is it protected from accidental extraction or git commitment? Should the RFC mandate `excludePathSegments: [".npmrc"]` in all extraction configs (following the forge precedent)?
3. What happens if `npm publish` succeeds but the published package is broken — is there a deprecation procedure, or does the operator manually unpublish within the 72h window?
