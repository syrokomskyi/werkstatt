---
id: RFC-0839
title: "Add Axiom post-deploy mobile layout monitoring"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-66
  - DNA-67
  - DNA-68
  - DNA-69
  - RFC-0837
  - RFC-0838
satisfies:
  - DNA-70
dependsOn:
  - RFC-0837
  - RFC-0838
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "A new Axiom instrument type `mobile-layout` is defined in `systems/methodologies.md` and registered in the instrument config schema."
  - "A new Axiom methodology `mobile-layout-stability` is declared in `systems/methodologies.md` with `active: false` and `blockOn: [high, critical]`."
  - "The `mission.check` command passes the mobile-layout methodology configuration to `runAxiomCheck` alongside existing methodologies."
  - "Axiom findings from the mobile-layout instrument are surfaced in the mission check result and the HTML report with rule IDs prefixed `MOBILE-AXIOM-*`."
  - "The methodology config schema (`methodologies-config.ts`) is extended to accept `mobile-layout` as a valid instrument type."
  - "DNA-70 is established in `docs/architecture-dna.md` and `dna.registry.validate` passes."
nonGoals:
  - "This RFC does not implement the Axiom instrument itself — that is done by an external expert in the `@syrokomskyi/axiom-factory-app` package."
  - "This RFC does not define the internal capture logic of the mobile-layout instrument — it defines the contract and integration points."
  - "This RFC does not replace the pre-deploy checks from RFC-0837 or RFC-0838. All three layers run in sequence."
  - "This RFC does not add visual regression to Axiom."
---

# RFC-0839: Add Axiom post-deploy mobile layout monitoring

## Context

RFC-0837 (static CSS) and RFC-0838 (Playwright geometric) catch mobile layout issues before deployment. However, some issues only manifest on real devices with real network conditions, real browser chrome (address bar show/hide), and real third-party scripts. Post-deploy monitoring on live URLs is the third and final layer of the mobile layout validation strategy.

The Werkstatt already integrates with Axiom via `mission.check` (RFC-0629, RFC-0665, RFC-0667, RFC-0668). Axiom runs methodologies (accessibility, runtime-health, SEO, security-headers, performance-vitals, visual-regression, privacy-consent, multilingual-consistency) against live URLs and produces structured findings. The methodologies are configured in `systems/methodologies.md` and the instrument types are defined in `methodologies-config.ts`.

This RFC extends Axiom with a new `mobile-layout` instrument type and `mobile-layout-stability` methodology. The actual instrument implementation is done by an external expert in the `@syrokomskyi/axiom-factory-app` package — this RFC defines the contract, integration points, and configuration.

## Problem

The following mobile layout issues can only be detected post-deploy on live URLs:

1. **Address bar show/hide layout shift** — Mobile browsers dynamically show/hide the address bar during scroll. This changes the viewport height and can cause layout shift that is not reproducible in Playwright's fixed-viewport emulation.

2. **Real device viewport variations** — Playwright uses a fixed viewport (390×844). Real devices have varying viewport sizes, pixel densities, and safe area insets (notch, home indicator) that can cause overflow not detected in emulation.

3. **Third-party script impact** — Analytics, consent managers, and chat widgets injected at runtime can cause layout shift that only appears on production URLs with real scripts loading.

4. **Network-conditioned layout shift** — Slow-loading resources (images, fonts) cause CLS on real networks. Playwright's `networkidle` wait masks this by waiting for all resources.

5. **Continuous monitoring** — Pre-deploy checks run once per deployment. Post-deploy monitoring catches regressions introduced by content changes, third-party script updates, or browser updates between deployments.

No Axiom methodology currently covers mobile layout stability. The existing `performance-vitals` methodology measures CLS but only at the page level — it does not check per-element stability during orientation changes or horizontal overflow.

## Decision

The Werkstatt extends its Axiom integration with a new `mobile-layout` instrument type and `mobile-layout-stability` methodology. The methodology is configured in `systems/methodologies.md` and passed to `runAxiomCheck` via the existing methodologies config mapping. The actual instrument implementation (Playwright-based capture, finding projection, rule definitions) is done by an external expert in the `@syrokomskyi/axiom-factory-app` package.

## Architectural fit

- **Architecture DNA:** Establishes DNA-70 (Axiom Post-Deploy Mobile Layout Monitoring). Extends DNA-66 (workshop testing pyramid) L5 (post-deploy health and critical-path checks) with a new mobile-layout monitoring methodology. Complements DNA-67 (pre-deploy Lighthouse parity gate) and DNA-69 (Playwright mobile layout stability checks).
- **Site OS operator model:** No new Werkstatt command. The existing `mission.check` command picks up the new methodology config automatically — no code change to `mission.check` is needed. The `methodologies-config.ts` schema is extended with the new instrument type.
- **Axiom integration:** Follows the existing pattern — `methodologies-config.ts` defines the schema, `systems/methodologies.md` declares active methodologies, `axiom-adapter.ts` maps the config and passes it to `runAxiomCheck`.
- **Scaling Playbook:** Applies uniformly across all sites — every site runs `mission.check` during the deployment pipeline.

## Design

### Instrument contract (for external expert)

The `mobile-layout` instrument must be implemented in `@syrokomskyi/axiom-factory-app` with the following contract:

#### Instrument type

```yaml
type: mobile-layout
```

#### Parameters

```yaml
params:
  devicePresets:
    - "iPhone 14 Pro"      # 390x844 portrait, 844x390 landscape
    - "iPhone SE"           # 375x667 portrait, 667x375 landscape
    - "Galaxy S20"          # 360x800 portrait, 800x360 landscape
  orientations:
    - portrait
    - landscape
  clsThreshold: 0.1
  overflowTolerance: 0      # scrollWidth must not exceed clientWidth by even 1px
  stabilityDeltaThreshold: 5 # px
  perRouteTimeout: 30000   # ms
  waitAfterLoad: 2000      # ms — wait for late layout shifts
```

#### Required findings (rule IDs)

The instrument MUST emit findings with the following rule IDs:

| Rule ID | Check | Severity | Description |
| --- | --- | --- | --- |
| `MOBILE-AXIOM-01` | Horizontal overflow | high | `scrollWidth > clientWidth` on any checked route in any orientation. |
| `MOBILE-AXIOM-02` | Orientation layout shift | high | Key element (header, main, footer, first section) position delta > `stabilityDeltaThreshold` after portrait→landscape rotation. |
| `MOBILE-AXIOM-03` | CLS exceeds threshold | medium | CLS ≥ `clsThreshold` on any checked route. |
| `MOBILE-AXIOM-04` | Address bar layout shift | high | Layout shift detected during simulated address bar show/hide (viewport height change of 50–80px). |
| `MOBILE-AXIOM-05` | Route timeout | medium | Route exceeded `perRouteTimeout` during capture. |

#### Finding shape

Each finding MUST conform to the existing `Finding` interface from `@syrokomskyi/axiom-study`:

```ts
interface Finding {
  ruleId: string;           // e.g. "MOBILE-AXIOM-01"
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  url: string;
  route: string;
  orientation?: "portrait" | "landscape";
  measured?: Record<string, number>;
  selector?: string;        // CSS selector of the affected element
}
```

### Methodologies config

#### Schema extension (`methodologies-config.ts`)

The `instrumentConfigSchema` type enum is extended:

```ts
type: z.enum([
  "accessibility",
  "runtime-health",
  "seo-runtime",
  "security-headers",
  "performance-vitals",
  "visual-regression",
  "privacy-consent",
  "multilingual-consistency",
  "mobile-layout",          // NEW
]),
```

The `KNOWN_INSTRUMENT_TYPES` array is extended with `"mobile-layout"`.

The `KNOWN_METHODOLOGY_IDS` array is extended with `"mobile-layout-stability"`.

#### Methodologies declaration (`systems/methodologies.md`)

```yaml
instruments:
  - id: mobile-layout-browser
    type: mobile-layout
    params:
      devicePresets:
        - "iPhone 14 Pro"
        - "iPhone SE"
        - "Galaxy S20"
      orientations:
        - portrait
        - landscape
      clsThreshold: 0.1
      overflowTolerance: 0
      stabilityDeltaThreshold: 5
      perRouteTimeout: 30000
      waitAfterLoad: 2000

methodologies:
  - id: mobile-layout-stability
    instrument: mobile-layout-browser
    active: true
    blockOn: [high, critical]
```

### Integration with `mission.check`

The existing `mapMethodologiesConfig` function in `axiom-adapter.ts` already maps methodologies to the `AxiomMethodologiesConfig` shape. No code change is needed — the new methodology is automatically picked up from `systems/methodologies.md` and passed to `runAxiomCheck`.

The `runAxiomCheck` function in `@syrokomskyi/axiom-factory-app` must be updated by the external expert to handle the `mobile-layout` instrument type. From the Werkstatt side, the integration is transparent.

### Error handling for unimplemented instrument

If `@syrokomskyi/axiom-factory-app` does not yet recognize the `mobile-layout` instrument type, `runAxiomCheck` may throw. The existing `try/catch` in `axiom-adapter.ts` (around the `runAxiomCheck` call) already catches errors and returns a `missionCheckFailResult` with `exitCode: 2` (infrastructure error). This is the existing behavior for all methodology failures — the mobile-layout methodology is not special. The RFC's "fail-open" expectation (emit warning, skip methodology) is a contract for the external expert's instrument dispatcher, not for the Werkstatt adapter. If the external expert implements fail-open at the instrument level, `runAxiomCheck` will not throw and the methodology is simply skipped with a warning in the study-run output.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/methodologies.md` | Extended with new instrument and methodology |
| `packages/werkstatt-site/src/checks/methodologies-config.ts` | Schema extended with `mobile-layout` type |
| `packages/werkstatt-site/src/checks/axiom-adapter.ts` | No change (existing mapping is generic) |
| `@syrokomskyi/axiom-factory-app` (external) | New instrument implementation |

### Output format

Findings from the `mobile-layout` instrument are included in the existing `mission.check` result and HTML report. No separate output format is needed. The findings appear alongside accessibility, SEO, and performance findings in `study-run.json` and `report.html`.

Example finding in `study-run.json`:

```json
{
  "ruleId": "MOBILE-AXIOM-01",
  "severity": "high",
  "title": "Horizontal overflow on /de/preis in landscape",
  "description": "scrollWidth (850px) exceeds clientWidth (844px) on iPhone 14 Pro landscape.",
  "url": "https://warpgogol-com.alt.workers.dev/de/preis",
  "route": "/de/preis",
  "orientation": "landscape",
  "measured": {
    "scrollWidth": 850,
    "clientWidth": 844,
    "device": "iPhone 14 Pro"
  }
}
```

### Failure modes

- **Methodology inactive:** If `active: false`, the methodology is skipped by `mission.check` and does not contribute to the gate decision.
- **Instrument not implemented:** If `@syrokomskyi/axiom-factory-app` does not yet implement the `mobile-layout` instrument type, `runAxiomCheck` should emit a warning and skip the methodology (fail-open). The external expert must implement the instrument before activating the methodology.
- **Gate aggregation:** Findings from the `mobile-layout` methodology are aggregated into the existing gate decision. `blockOn: [high, critical]` means `MOBILE-AXIOM-01`, `MOBILE-AXIOM-02`, and `MOBILE-AXIOM-04` (high severity) block deployment. `MOBILE-AXIOM-03` and `MOBILE-AXIOM-05` (medium severity) do not block.
- **Suppression:** Existing suppression rules in `systems/axiom-suppressions.yaml` apply to mobile-layout findings. Findings can be suppressed by `ruleId`, `route`, or `category`.

### Compass sync

`docs/verification-plan.xml` tracks verification methods and must be updated to include the `mobile-layout-stability` methodology. No other `docs/*.xml` files are affected — this RFC does not change requirements, technology choices, or source markup contracts.

## Rollout

1. **Schema extension (Werkstatt side):** Extend `methodologies-config.ts` with the `mobile-layout` instrument type. This is a non-breaking change — existing configs without the new type continue to validate.

2. **Methodology declaration (Werkstatt side):** Add the `mobile-layout-browser` instrument and `mobile-layout-stability` methodology to `systems/methodologies.md` with `active: false` initially.

3. **Instrument implementation (external expert):** The external expert implements the `mobile-layout` instrument in `@syrokomskyi/axiom-factory-app`. This includes Playwright-based capture with real device presets, orientation change simulation, address bar show/hide simulation, and finding projection.

4. **Activation:** Once the instrument is implemented and tested, set `active: true` in `systems/methodologies.md`. The methodology now contributes to the `mission.check` gate decision.

5. **Suppression tuning:** During initial activation, false positives may need suppression. Add suppression rules to `systems/axiom-suppressions.yaml` as needed.

6. **Pipeline integration:** No pipeline change needed — `mission.check` is already called in `leitstand.dev-deploy` and `leitstand.propagate`. The new methodology is automatically included when `active: true`.

## Alternatives considered

- **Extend `performance-vitals` methodology:** The existing `performance-vitals` instrument already measures CLS. However, it does not check horizontal overflow, orientation stability, or address bar layout shift. Extending it would conflate two distinct concerns. A separate methodology is cleaner.

- **Real device farm (BrowserStack, Sauce Labs):** Real device testing is more accurate than emulation but introduces external dependencies, cost, and latency. Playwright's device emulation is sufficient for the common cases. Real device testing can be added as a future enhancement.

- **Web Vitals JavaScript library in production:** Injecting the `web-vitals` library into production pages would provide real-user CLS data. However, this requires client-side JavaScript, adds page weight, and does not cover horizontal overflow or orientation stability. Axiom's server-side Playwright capture is more comprehensive.

## Risks

- **External dependency:** The instrument implementation depends on an external expert. If the implementation is delayed, the methodology stays `active: false` and does not block deployments. The Werkstatt-side changes (schema, config) are non-breaking and can be merged independently.
- **False positives from device variation:** Different device presets may produce different results. The `overflowTolerance: 0` setting is strict — any 1px overflow is a finding. This may need tuning based on real-world results.
- **Execution time:** Adding another methodology to `mission.check` increases the total check duration. The `mobile-layout` instrument runs Playwright against multiple device presets and orientations, which is slower than HTTP-based methodologies. The `perRouteTimeout` (30s) and Axiom's crawl limits (`maxUrls`, `maxDuration`) cap the total time.
- **Overlap with RFC-0838:** The Playwright pre-deploy check (RFC-0838) and the Axiom post-deploy check (RFC-0839) test similar properties. This is intentional — the pre-deploy check catches issues before they reach production, and the post-deploy check catches issues that only manifest on real devices and real networks. The overlap is a safety net, not redundancy.

## Acceptance criteria

- [ ] `methodologies-config.ts` schema extended with `mobile-layout` instrument type
- [ ] `KNOWN_INSTRUMENT_TYPES` array includes `mobile-layout`
- [ ] `KNOWN_METHODOLOGY_IDS` array includes `mobile-layout-stability`
- [ ] `systems/methodologies.md` declares `mobile-layout-browser` instrument and `mobile-layout-stability` methodology
- [ ] Methodology initially set to `active: false` (activated after external implementation)
- [ ] Verify that `mission.check` picks up the new methodology config without code changes by running `methodologies.validate` (existing `mapMethodologiesConfig` is generic)
- [ ] Instrument contract (rule IDs, finding shape, parameters) documented for external expert
- [ ] `methodologies.validate` passes with the new config
- [ ] `docs/verification-plan.xml` updated to include `mobile-layout-stability` methodology
- [ ] No `AGENTS.md` updates required (this RFC does not change agent behavior rules — it is a config/schema extension only)
- [ ] DNA-70 entry appended to `docs/architecture-dna.md`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0839` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0839 --reason "..." --invariant "DNA-N"` instead of working around it.
- Agents MUST NOT implement the `mobile-layout` instrument itself — that is done by an external expert in `@syrokomskyi/axiom-factory-app`. The Werkstatt-side changes are limited to schema extension, config declaration, and documentation.
- Agents MUST set the methodology to `active: false` initially. Activation requires explicit operator approval after the external expert confirms the instrument is implemented and tested.
