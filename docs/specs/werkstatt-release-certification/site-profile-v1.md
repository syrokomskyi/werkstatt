# Site Certification Profile v1

This document defines the first normative certification profile for Astro site workshops. It is plugin-owned data interpreted by the Werkstatt engine. Implementation RFCs may split producers into modules, but they must preserve every required requirement, status rule, gate placement, and evidence relationship described here.

## Profile identity

```yaml
schema: werkstatt/certification-profile@1
id: warpgogol-site
version: 1.0.0
plugin:
  id: werkstatt-site
  profileId: astro-typescript-turborepo
```

The installed `@warpgogol/werkstatt-site` package owns this profile. The core engine owns its schema, validation, hashing, aggregation, persistence, and lifecycle. A change that adds, removes, reclassifies, or weakens a requirement changes the canonical profile hash and requires an explicit profile version change.

## Gate model

| Gate | Subject | Evidence environment | Purpose |
|---|---|---|---|
| `dev-deploy` | immutable candidate before first deployment | authoring and build | prove that the candidate is coherent and safe enough to deploy to Dev |
| `propagate-alt` | the same candidate running on Dev | dev, plus reusable build evidence | prove rendered behavior and qualitative quality before Alt |
| `promote-main` | the same candidate running on Alt | alt, plus explicitly reusable evidence | prove environment-specific readiness before Main |
| `continuous-health` | the candidate currently serving Main | main | detect expiry, drift, outage, or revocation after promotion |

Authoring is allowed to be incomplete. Every deployment transition requires `pass`. A gate must never infer a pass from a successful build, missing producer, empty result set, expired result, previous candidate, or previous environment.

## Producer catalog

Producer identifiers are stable public identifiers. Commands shown here are logical kernel command surfaces; implementation RFCs must map them to registered module loaders and include their code/version hash in evidence.

| Producer ID | Kind | Logical command or evaluator | Required payloads |
|---|---|---|---|
| `core.candidate-integrity` | kernel command | `release.candidate.verify` | candidate manifest, artifact manifest, behavior snapshot |
| `core.dossier-integrity` | kernel command | `release.certification.verify` | verification report |
| `site.content-contract` | kernel command | existing content/schema validators through a profile adapter | canonical diagnostics, content projection |
| `site.business-truth` | kernel command | PBP and claim/evidence validation through a profile adapter | business projection, claim/evidence report |
| `site.editorial` | kernel command | editorial, locale, link, and terminology checks | page findings, locale coverage |
| `site.information-architecture` | kernel command | route, navigation, metadata, structured-data, and crawl checks | route graph, crawl report |
| `site.ux-contract` | kernel command | action, form, contact, conversion, and responsive-state checks | interaction inventory, diagnostics |
| `site.visual-browser` | remote workload | deterministic browser capture and visual rules | screenshots, DOM/accessibility snapshots, viewport matrix |
| `site.accessibility` | remote workload | automated accessibility scan plus keyboard/focus checks | accessibility results, focus trace |
| `site.performance` | remote workload | Lighthouse/performance runner | Lighthouse JSON, trace summary |
| `site.runtime` | remote workload | route smoke, asset, hydration, console, and network checks | request log, browser console, failing captures |
| `site.security` | remote workload | headers, transport, public exposure, dependency/config checks | header matrix, exposure report |
| `site.operational-readiness` | kernel command | deployment identity, DNS, environment, rollback checks | environment identity, readiness report |
| `site.qualitative-evaluator` | evaluator agent | versioned site-quality rubric | evaluator payload, referenced captures |
| `site.health-probe` | remote workload | scheduled Main route and identity probe | availability samples, identity assertion |
| `site.health-security` | remote workload | scheduled Main TLS/header/DNS drift probe | drift report |
| `site.health-content` | evaluator or kernel command | scheduled public-surface/claim expiry review | public snapshot, expiry findings |

No profile producer may write directly into a dossier. It returns a typed result to the engine, which validates, redacts, envelopes, hashes, attests, and appends it.

## Requirement matrix

`R` means required. `C` means conditional with explicit applicability evidence. `A` means advisory and cannot determine gate status. A blank cell means the requirement is not part of that gate; it does not mean an implicit pass.

### Core and candidate integrity

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Reuse/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `CORE-001` | Candidate identity recomputes exactly and source tree is clean/immutable | R | R | R | R | `core.candidate-integrity` | reusable only while all bound digests match |
| `CORE-002` | Artifact manifest, distribution tree, behavior snapshot, and candidate agree | R | R | R | R | `core.candidate-integrity` | reusable; runtime identity rechecked per environment |
| `CORE-003` | Active plugin/profile identity and canonical profile hash match candidate | R | R | R | R | `core.candidate-integrity` | reusable until package/config changes |
| `CORE-004` | Dossier event chain, referenced payloads, and selected evidence are intact | R | R | R | R | `core.dossier-integrity` | recompute at every gate/monitor run |
| `CORE-005` | Required durable dossier replica matches current root |  | R | R | R | `core.dossier-integrity` | environment-independent; verify before transition |
| `CORE-006` | Deployed build identity resolves to this candidate |  | R | R | R | `site.operational-readiness` | environment-specific; max age 30 minutes during gates |

### Business truth and compliance

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `BUS-001` | Business identity, contacts, locations, legal entity, and canonical identifiers are internally consistent | R | R | R | C | `site.business-truth` | Main rerun if public projection changes; continuous on expiry/change |
| `BUS-002` | Products, catalog entries, offerings, prices, currencies, availability, and conditions are schema-valid and mutually consistent | C | C | C | C | `site.business-truth` | applies when commercial surfaces exist |
| `BUS-003` | Public claims have admissible evidence, scope, freshness, and disclosure | C | C | C | C | `site.business-truth` | applies when claims exist; TTL follows evidence expiry |
| `BUS-004` | Required legal, privacy, consent, and disclosure surfaces exist and match enabled capabilities | C | R | R | C | `site.business-truth` | applicability from forms, analytics, auth, payments, tracking, jurisdictions |
| `BUS-005` | No contradictory or orphaned business values appear across canonical content and rendered pages |  | R | R | C | `site.business-truth` | rendered check is environment-specific |

### Editorial quality and localization

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `EDT-001` | Required content fields, headings, summaries, labels, and calls to action are complete | R | R | R |  | `site.editorial` | all public routes |
| `EDT-002` | Spelling, grammar, terminology, register, and factual references meet the configured editorial policy |  | R | R | C | `site.editorial` | locale-specific; continuous on public content drift |
| `EDT-003` | Every supported locale has required route/content coverage with correct fallback behavior | C | C | C | C | `site.editorial` | applies when more than one locale is declared |
| `EDT-004` | Links, media alternatives, citations, dates, units, and contact values are valid and unambiguous | R | R | R | C | `site.editorial` | external link freshness defaults to 24 hours for promotion |
| `EDT-005` | No placeholders, scaffolding language, synthetic assertions, or agent-facing instructions leak publicly | R | R | R | C | `site.editorial` | all public output |

### Information architecture and discoverability

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `IA-001` | Route graph has no unintended orphan, duplicate, cyclic-canonical, or unreachable public page | R | R | R | C | `site.information-architecture` | rerun per rendered environment |
| `IA-002` | Navigation hierarchy, breadcrumbs, page titles, landmarks, and contextual paths are coherent |  | R | R | C | `site.information-architecture` | rendered route graph |
| `IA-003` | Canonical URLs, robots rules, sitemap, redirects, status codes, and indexability agree |  | R | R | R | `site.information-architecture` | environment-specific; Main max age 6 hours |
| `IA-004` | Metadata and structured data are valid, truthful, unique where required, and consistent with visible content | R | R | R | C | `site.information-architecture` | per public route/template |
| `IA-005` | Search/intention-critical content can be located within the configured navigation and crawl budget |  | R | R |  | `site.information-architecture` | required for declared primary journeys |

### UX and conversion

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `UX-001` | Every primary journey has a visible, truthful, reachable action and completion state |  | R | R | C | `site.ux-contract` | configured primary journeys |
| `UX-002` | Forms and interactive actions validate input, explain failure, preserve user work, and expose success | C | C | C | C | `site.ux-contract` | applies when interactive surfaces exist |
| `UX-003` | Contact, booking, purchase, authentication, download, and external handoff destinations resolve correctly | C | C | C | C | `site.ux-contract` | applies by capability; environment-specific |
| `UX-004` | Responsive layouts preserve content order, action visibility, and operability at required viewports |  | R | R |  | `site.visual-browser` | viewport matrix bound to profile |
| `UX-005` | Error, empty, loading, offline, and unavailable states are deliberate for enabled runtime features | C | C | C |  | `site.ux-contract` | applies to features with those states |

### Visual quality and accessibility

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `VIS-001` | Required routes and states render without overlap, clipping, unintended overflow, missing assets, or broken composition |  | R | R | C | `site.visual-browser` | required viewport/state matrix; continuous on drift signal |
| `VIS-002` | Typography, spacing, color, imagery, and component use conform to the declared design system |  | R | R |  | `site.visual-browser` | evaluator may add qualitative diagnostics |
| `A11Y-001` | Automated accessibility scan has no configured blocking violations |  | R | R | C | `site.accessibility` | every representative template; Main max age 24 hours |
| `A11Y-002` | Keyboard navigation, focus order/visibility, dialogs, menus, and form errors are operable | C | C | C |  | `site.accessibility` | applies to interactive components |
| `A11Y-003` | Semantic structure, accessible names, language, media alternatives, contrast, zoom, and reduced motion satisfy policy | R | R | R | C | `site.accessibility` | static checks reusable only when DOM/style hashes match |

### Performance and runtime correctness

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `PERF-001` | Profile-defined Core Web Vitals and Lighthouse budgets pass on representative routes/viewports |  | R | R | C | `site.performance` | environment-specific; Main max age 6 hours |
| `PERF-002` | Asset sizes, image dimensions/formats, font loading, JS/CSS budgets, and caching policy pass | R | R | R | C | `site.performance` | build evidence reusable if artifact/config hashes match |
| `RUN-001` | Public routes, assets, redirects, APIs, and enabled actions return expected status/content type |  | R | R | R | `site.runtime` | environment-specific; Main health max age 5 minutes |
| `RUN-002` | No blocking browser console errors, hydration failures, rejected requests, or mixed content occur |  | R | R | C | `site.runtime` | representative route/state matrix |
| `RUN-003` | Runtime configuration contains all required public bindings and no development-only endpoint | R | R | R | C | `site.runtime` | environment identity specific |

### Security and operational readiness

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `SEC-001` | No secret, private source map, internal instruction, unintended file, or sensitive metadata is publicly exposed | R | R | R | C | `site.security` | artifact and public crawl |
| `SEC-002` | TLS, security headers, CSP where configured, CORS, cookies, framing, MIME, and referrer policy meet profile |  | R | R | R | `site.security` | environment-specific; Main max age 6 hours |
| `SEC-003` | Dependencies/build config have no policy-blocking known vulnerability or insecure production mode | R | R | R | C | `site.security` | freshness set by vulnerability source; default 24 hours |
| `OPS-001` | DNS, custom domains, certificate, environment bindings, and deployment identity match target channel |  | R | R | R | `site.operational-readiness` | environment-specific |
| `OPS-002` | Main promotion has an eligible verified rollback candidate and recorded rollback procedure |  |  | R | R | `site.operational-readiness` | re-evaluate when deployment/incident state changes |
| `OPS-003` | Required observability/health endpoints and incident routing are active |  | R | R | R | `site.operational-readiness` | environment-specific |

### Independent qualitative evaluation

| ID | Requirement | Dev | Alt | Main | Continuous | Producer | Applicability/freshness |
|---|---|---:|---:|---:|---:|---|---|
| `EVAL-001` | Versioned rubric evaluation of representative public routes and primary journeys reaches consensus |  | R | R | C | `site.qualitative-evaluator` | bound to input bundle/captures; continuous only on drift trigger |
| `EVAL-002` | Evaluation input bundle covers all changed templates, critical surfaces, locales, and declared viewports |  | R | R |  | `site.qualitative-evaluator` | completeness checked by engine/profile adapter |
| `EVAL-003` | Evaluator diagnostics contain reproducible anchors and actionable acceptance criteria |  | R | R |  | `site.qualitative-evaluator` | schema requirement; generic prose is invalid evidence |

## Environment-independent evidence

Evidence may cross environments only when the requirement explicitly declares it and all identity inputs match. V1 permits reuse for:

- candidate, source, artifact, plugin, profile, and toolchain integrity;
- static content/schema/business rules whose input is the immutable candidate content;
- static dependency/config analysis bound to lockfile, artifact, and policy source;
- artifact-level asset budgets and public-file exposure analysis;
- evaluator conclusions only when their input bundle is byte-identical and contains no environment-dependent observation.

V1 forbids cross-environment reuse for deployed build identity, route responses, external integrations, forms, DNS, TLS, headers, redirects, runtime configuration, browser console/network behavior, performance measurements, and operational readiness.

## Applicability rules

Conditional requirements use machine-readable facts, never author or evaluator discretion. The initial entitlement/surface facts include:

- supported locales;
- public claims and evidence expiry;
- products, prices, offers, or availability;
- forms, booking, contact, downloads, authentication, payments, APIs, and external integrations;
- analytics, tracking, cookies, consent, and personal-data collection;
- media requiring alternatives/captions;
- client-side interactive components and asynchronous states;
- custom domains and Main deployment capability.

The producer emits `not-applicable` evidence containing the rule, resolved fact, input hash, and reason. Missing or unresolvable facts yield `incomplete`.

## Risk classification for evaluators

A release is critical when changed or enabled surfaces include any of:

- first production cutover;
- business identity, legal entity, public contact, location, ownership, or canonical identifier;
- products, offerings, prices, currencies, conditions, availability, or commercial claims;
- legal, privacy, consent, disclosure, evidence, or regulated content;
- personal data, authentication, authorization, payments, forms, booking, or external integrations;
- locale architecture, canonical/redirect/indexing rules, or site-wide information architecture;
- site-wide redesign, navigation replacement, new primary journey, or shared layout/component change affecting most routes;
- agent-facing or machine-actionable public surfaces;
- security headers, DNS, domains, certificates, runtime bindings, or deployment topology.

Ordinary releases require one evaluator. Critical releases require two independent evaluators. A result is borderline when the configured confidence lies within the rubric margin, any criterion is borderline, or deterministic coverage detects a high-impact surface not adequately reviewed; borderline releases require two evaluators. Evaluators run without access to one another's outputs. Missing independence or disagreement is `incomplete`.

## Qualitative rubric

The first rubric must score and explain at least:

1. truthfulness and absence of unsupported implication;
2. audience/message clarity;
3. information hierarchy and findability;
4. primary journey and action clarity;
5. visual coherence, craft, and responsiveness;
6. accessibility beyond automated rule coverage;
7. editorial naturalness and locale appropriateness;
8. trust, disclosure, error handling, and expectation setting;
9. completeness of the reviewed route/state/viewport bundle.

A numerical average cannot override a blocking criterion. The rubric defines per-criterion blocking thresholds, required anchors, confidence calibration, and examples. The rubric ID/version and full input bundle hash are part of evaluator evidence.

## Main verification and continuous health

After traffic switching, Main enters `main-verifying`. The engine rechecks build identity, public routes, redirects, DNS/TLS, headers, primary actions, health/observability, and a bounded performance/runtime sample. Main becomes `main-certified` only after these requirements pass and the resulting dossier root is durably replicated.

Continuous health schedules default to:

- availability, route identity, and critical-action smoke: every 5 minutes;
- DNS/TLS/security headers: every 6 hours and on deployment/domain events;
- sitemap, robots, canonical, redirect, and indexability drift: every 6 hours;
- external links/integrations and dependency vulnerability source: every 24 hours;
- claim/evidence/legal/content expiry: before the nearest declared expiry and at least daily;
- qualitative re-evaluation: on detected public output drift, new candidate, or incident request, not on a blind timer.

An infrastructure-wide outage should normally open an incident and retry without rolling back to an equally affected artifact. Candidate-specific runtime/security regressions may trigger rollback when a verified rollback candidate is useful. Historical gate decisions remain immutable; current health becomes `degraded` or `revoked`.

## Prohibited weakening

Profile v1 cannot contain or honor:

- grace periods that convert missing/failed evidence into success;
- `--force`, `--skip-certification`, waiver, exception, or manual approval paths for required gates;
- direct filesystem writes by evidence producers;
- result aggregation based only on process exit code or diagnostic count;
- `not-applicable` without machine evidence;
- successful promotion of a rebuilt or identity-mismatched artifact;
- evaluator evidence produced by an authoring/mutating agent in the same run;
- Main certification before required post-switch checks and durable dossier sync.

False positives are corrected by changing the producer, applicability rule, rubric, or profile through a versioned normative change. They are never bypassed at runtime.
