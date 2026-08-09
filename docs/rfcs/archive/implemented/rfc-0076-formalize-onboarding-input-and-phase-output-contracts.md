---
id: RFC-0076
title: Formalize onboarding input and phase output contracts
status: superseded
kind: contract
scope: workspace
owners:
- architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: &id001 2026-05-18
implementedAt: 2026-05-18
closedAt: *id001
supersedes: []
supersededBy: RFC-0532
related:
- RFC-0029
- RFC-0030
- RFC-0047
- RFC-0070
- RFC-0073
- RFC-0074
- RFC-0075
commands:
  proposed:
  - onboarding.input.validate
  - onboarding.phase.validate
  added:
  - onboarding.input.validate
  - onboarding.phase.validate
  changed:
  - app.contract.full
  - app.qa.validate
  - apps-check.run
  removed: []
appsImpacted: []
packagesImpacted:
- os/site-kernel
- os/site-kernel-checks
- os/site-kernel-content
- share
successSignals:
- onboarding/.input is treated as the read-only source bundle for client materials
- onboarding/.output/00-intake/input-manifest.json records normalized file inventory and content hashes for every onboarding input
- Every phase output declares the input manifest hash it was derived from, allowing stale phase outputs to be detected deterministically
- app.qa.validate refuses to declare audit success when required scaffold, compose, or author phase artifacts are missing or stale
- Agents have a single phase contract command to run before each onboarding phase instead of inferring readiness from prose
nonGoals:
- Replacing the workflow files introduced by RFC-0075
- Re-running raw research through audit validators; audit validators consume assembled apps and distilled phase outputs
- Introducing a full workflow engine or database-backed state machine

---

# RFC-0076: Formalize onboarding input and phase output contracts

## Context

The onboarding system already has a practical material bundle under `onboarding/.input` and phase outputs under `onboarding/.output`. RFC-0070 through RFC-0075 describe the agent-driven path from research materials to a thin app, generated content, QA, and handoff. RFC-0074 adds deterministic and LLM-backed audit validators, but those validators currently infer phase readiness from the presence or absence of individual files.

That inference is too weak for a repeatable business onboarding ecosystem. Agents need a single machine-readable contract that answers: what material was received, which phase outputs were derived from it, whether those outputs are stale, and whether a later phase is allowed to proceed.

## Problem

1. **Input material readiness is implicit.** `onboarding/.input` contains many business materials, but no canonical inventory records which files were present and what hashes downstream outputs were derived from.
2. **Phase outputs are not freshness-checked.** A composed linking plan or author atoms file can survive after input materials change, and validators cannot detect the drift.
3. **Audit validators carry missing-artifact policy locally.** Commands such as `seo.internal-linking.validate`, `analytics.config.validate`, `first-party-data.validate`, and `infra.brief.validate` decide independently whether a missing phase file is a warning or an error.
4. **Agents lack a phase gate.** Workflows say which phase comes next, but there is no kernel command that verifies the phase can start or complete.
5. **Thin app quality depends on output contracts.** Apps should remain composition-only; phase outputs must therefore become the authoritative interface between research, synthesis, package-owned implementation, and app content.

## Decision

The kernel gains two app-scoped commands:

1. **`onboarding.input.validate`** validates `onboarding/.input`, writes or verifies `onboarding/.output/00-intake/input-manifest.json`, and reports missing required source materials.
2. **`onboarding.phase.validate --phase <phase>`** validates the declared inputs and outputs for a phase, including freshness against the current input manifest hash.

The onboarding phase contract becomes the single source of truth for required phase artifacts. Audit validators consume this contract instead of independently downgrading missing required artifacts to warnings.

## Architectural fit

- **RFC-0029 / RFC-0030.** Earlier onboarding playbook and scaffold result-envelope work become enforceable through phase validation.
- **RFC-0047.** The output contract produces CMS-friendly app content and rejects legacy content surfaces.
- **RFC-0073.** Author-phase artifacts such as `atoms.yaml`, `voice-profile.yaml`, and `coverage.md` become required phase outputs with input-hash provenance.
- **RFC-0074.** Audit validators no longer decide phase readiness locally; `app.qa.validate` runs the audit phase contract first.
- **RFC-0075.** Workflow files continue to orchestrate phases; these commands provide the machine-checkable readiness gates for those workflows.

## Design

### CLI surface

```sh
pnpm exec werkstatt run onboarding.input.validate --app <id>
pnpm exec werkstatt run onboarding.phase.validate --app <id> --phase=00-intake
pnpm exec werkstatt run onboarding.phase.validate --app <id> --phase=02-scaffold
pnpm exec werkstatt run onboarding.phase.validate --app <id> --phase=03-compose
pnpm exec werkstatt run onboarding.phase.validate --app <id> --phase=04-author
pnpm exec werkstatt run onboarding.phase.validate --app <id> --phase=05-audit
```

`--phase` is a closed enum. The initial implementation recognizes:

- `00-intake`
- `02-scaffold`
- `03-compose`
- `04-author`
- `05-audit`

Phase aliases from RFC-0075 workflows may map onto these numeric phases, but stored artifact paths use the numeric names.

### TypeScript contracts

```ts
export type OnboardingPhase =
  | "00-intake"
  | "02-scaffold"
  | "03-compose"
  | "04-author"
  | "05-audit";

export interface OnboardingInputManifest {
  version: 1;
  generatedAt: string;
  inputRoot: "onboarding/.input";
  inputHash: string;
  files: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    kind: "brief" | "profile" | "research" | "audit" | "visual" | "strategy" | "other";
    required: boolean;
  }>;
}

export interface OnboardingPhaseOutputHeader {
  phase: OnboardingPhase;
  derivedFromInputHash: string;
  generatedAt: string;
  generator: string;
}

export interface OnboardingPhaseValidationResult {
  command: "onboarding.phase.validate";
  app: string;
  phase: OnboardingPhase;
  status: "ok" | "warn" | "fail";
  findings: Array<{
    ruleId: string;
    severity: "info" | "warn" | "error";
    file?: string;
    message: string;
  }>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `onboarding/.input/**` | Read-only client material source bundle. |
| `onboarding/.output/00-intake/input-manifest.json` | Canonical inventory and hash of all input materials. |
| `onboarding/.output/02-scaffold/infra-config.yaml` | Scaffold phase contract consumed by infra audit. |
| `onboarding/.output/03-compose/linking-plan.yaml` | Compose phase internal-linking contract. |
| `onboarding/.output/03-compose/analytics-config.yaml` | Compose phase analytics contract. |
| `onboarding/.output/04-author/atoms.yaml` | Author phase content atom contract. |
| `onboarding/.output/04-author/voice-profile.yaml` | Author phase voice contract. |
| `onboarding/.output/04-author/first-party-data.yaml` | Author phase first-party data contract. |
| `onboarding/.output/05-audit/audit-report.md` | Audit phase report generated by `app.qa.validate`. |
| `onboarding/.output/05-audit/llm-cache.jsonl` | LLM audit cache keyed by content and prompt inputs. |

Every machine-readable phase output SHOULD include a top-level `phase`, `derivedFromInputHash`, and `generatedAt` field. Markdown outputs SHOULD include an equivalent YAML frontmatter header.

### Output format

Both commands emit the shared kernel result envelope. In `--json`, `data` contains the command-specific result object.

```json
{
  "command": "onboarding.phase.validate",
  "app": "nicaragua-projekt",
  "phase": "05-audit",
  "status": "fail",
  "findings": [
    {
      "ruleId": "onboarding.phase.missing-output",
      "severity": "error",
      "file": "onboarding/.output/03-compose/linking-plan.yaml",
      "message": "Required compose output is missing before audit phase."
    }
  ]
}
```

### Failure modes

- Missing required input file in `00-intake` fails `onboarding.input.validate`.
- A required output missing for a completed or later phase fails `onboarding.phase.validate`.
- A phase output whose `derivedFromInputHash` does not match the current manifest hash fails the phase validator.
- Optional material omissions may warn, but required phase artifacts do not downgrade to warnings during or after their owning phase.
- `app.qa.validate` runs `onboarding.phase.validate --phase=05-audit` before audit validators and refuses to declare overall success when it fails.

## Rollout

1. Add the input manifest builder and `onboarding.input.validate`.
2. Add `onboarding.phase.validate` with phase definitions for `00-intake`, `02-scaffold`, `03-compose`, `04-author`, and `05-audit`.
3. Update phase-producing commands and workflows to write `derivedFromInputHash` metadata.
4. Update RFC-0074 validators to ask the phase validator for readiness instead of locally warning on missing required outputs.
5. Add `onboarding.input.validate` and the relevant phase validation steps to workflow files and `apps-check.run` where appropriate.
6. Validate `apps/nicaragua-projekt` by regenerating or explicitly marking required phase outputs.

## Alternatives considered

- **Keep missing-output warnings in each validator.** Rejected because this spreads phase policy across unrelated commands and lets audit phase pass with incomplete upstream work.
- **Store phase state in a database.** Rejected because the repository already uses source-controlled artifacts and should remain reproducible from files.
- **Make validators read raw `onboarding/.input` directly.** Rejected because RFC-0074 intentionally audits assembled apps and distilled outputs, not raw research bundles.

## Risks

- **Existing onboarding outputs may fail freshness checks.** This is intended; agents must regenerate stale outputs or explicitly document why a phase is incomplete.
- **Overly rigid required-file lists could block unusual clients.** Mitigated by making required/optional status explicit in phase contract data, not scattered through validators.
- **Agents may hand-edit hashes.** Mitigated by regenerating `input-manifest.json` through the command and checking hashes in CI.

## Acceptance criteria

- [x] `OnboardingInputManifest` and phase result contracts are defined in a shared package or `site-kernel-checks` module. (evidence: implemented historically)
- [x] `onboarding.input.validate` is registered app-scoped and validates `onboarding/.input`. (evidence: implemented historically)
- [x] `onboarding.phase.validate` is registered app-scoped and validates all declared phases. (evidence: implemented historically)
- [x] `onboarding/.output/00-intake/input-manifest.json` is generated deterministically from `onboarding/.input`. (evidence: implemented historically)
- [x] Required phase outputs carry `derivedFromInputHash` metadata. (evidence: implemented historically)
- [x] `app.qa.validate` invokes `onboarding.phase.validate --phase=05-audit` before RFC-0074 validators. (evidence: implemented historically)
- [x] RFC-0074 validators no longer independently downgrade missing required phase artifacts to warnings during audit phase. (evidence: implemented historically)
- [x] Workflow files mention the phase validation commands at phase boundaries. (evidence: implemented historically)
- [x] `apps/nicaragua-projekt` passes the new phase validation after required outputs are regenerated or authored. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes for this RFC only after a human changes `status` to `accepted`.
- Agents MUST NOT change RFC status fields.
- Agents MUST treat `onboarding/.input/**` as read-only source material.
- Agents MUST write generated or derived artifacts only under the declared `onboarding/.output/<phase>/` directories.
- Agents MUST NOT silence missing phase outputs by editing audit reports or LLM cache files.
- Agents MUST update the relevant GRACE XML documents when this RFC changes command surfaces, verification policy, or onboarding architecture.
