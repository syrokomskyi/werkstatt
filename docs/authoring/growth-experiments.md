# Growth Experiments

> **Established by:** RFC-0027 · DNA-29

Experiments are content-declared A/B tests managed through the growth layer. They live in `packages/ontology/growth/experiments/` and are activated per-app in `system.yaml`.

---

## Experiment lifecycle

```
draft → active → concluded → archived
```

| Status      | Description                                                            |
| ----------- | ---------------------------------------------------------------------- |
| `draft`     | Experiment defined but not yet running. Safe to edit.                  |
| `active`    | Running — must be listed in `system.yaml growth.experiments[]`.        |
| `concluded` | Results read. Must have `concludedAt` date. Remove from `system.yaml`. |
| `archived`  | Historical record only. Must not appear in `system.yaml`.              |

---

## Experiment YAML schema

```yaml
# packages/ontology/growth/experiments/<id>.yaml

id: hero-cta-label             # must match filename (kebab-case)
label: "Hero CTA Label Test"   # human label for dashboards
hypothesis: >
  Changing the donate CTA from 'Jetzt spenden' to 'Jetzt helfen'
  will increase click-through rate on the hero section.
status: active                 # draft | active | concluded | archived

variants:                      # first variant must always be "control"
  - id: control
    label: "Jetzt spenden"
    description: "Current production label"
  - id: treatment-a
    label: "Jetzt helfen"
    description: "Alternative label emphasising action"

# Required when status is "concluded" or "archived":
# concludedAt: "2026-06-01"
# winner: treatment-a           # optional — the winning variant id
```

---

## Adding an experiment

1. Create `packages/ontology/growth/experiments/<id>.yaml` with `status: draft`.
2. Add the experiment id to `system.yaml growth.experiments[]` when ready to run.
3. Change `status` to `active`.
4. Run `pnpm --filter <app> growth.experiment.validate` to verify.

---

## Concluding an experiment

1. Set `status: concluded` in the experiment YAML.
2. Add `concludedAt: "YYYY-MM-DD"` and optionally `winner: <variant-id>`.
3. Remove the experiment id from `system.yaml growth.experiments[]`.
4. Run `pnpm --filter <app> growth.experiment.archive` — must pass with 0 violations.

---

## Validation rules

| Rule    | Check                                          | Command                      |
| ------- | ---------------------------------------------- | ---------------------------- |
| `GX-01` | Valid YAML                                     | `growth.experiment.validate` |
| `GX-02` | Required fields: id, label, hypothesis, status | `growth.experiment.validate` |
| `GX-03` | id matches filename                            | `growth.experiment.validate` |
| `GX-04` | status in closed vocabulary                    | `growth.experiment.validate` |
| `GX-05` | ≥ 2 variants                                   | `growth.experiment.validate` |
| `GX-06` | Each variant has id + label                    | `growth.experiment.validate` |
| `GX-07` | First variant id = "control"                   | `growth.experiment.validate` |
| `GX-08` | system.yaml refs resolve to known files        | `growth.experiment.validate` |
| `GA-01` | concluded experiments have concludedAt         | `growth.experiment.archive`  |
| `GA-02` | concluded/archived not in system.yaml          | `growth.experiment.archive`  |

---

## Extending experiments

Experiment assignment logic (which visitor gets which variant) is resolved server-side in a future RFC. At MVP, experiment ids are passed to `ClientRuntimeContext.experiments[]` but no assignment algorithm is active — all visitors receive the control variant implicitly.
