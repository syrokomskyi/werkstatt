---
id: RFC-0302
title: "Govern external site check safety, privacy, and consent"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0177
  - RFC-0181
  - RFC-0214
  - RFC-0293
  - RFC-0294
  - RFC-0296
  - RFC-0299
commands:
  proposed: []
  added:
    - check.safety.validate
  changed:
    - check.run
    - check.evidence.capture
  removed: []
appsImpacted:
  - check-webgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/check-runner-node"
  - "@gogol/site-kernel-check-webgogol"
successSignals:
  - "The checker does not become a crawler abuse tool."
  - "Private alt checks require explicit target policy and host allowlists."
  - "Artifacts redact secrets and avoid storing form values, cookies, personal data, or authentication material."
  - "Third-party site checks respect robots policy by default and clearly separate owner-authorized checks from public observations."
nonGoals:
  - "Do not implement a legal terms page for the product app here."
  - "Do not enable automated source monitoring of arbitrary third-party sites."
  - "Do not store user-submitted credentials in app content or reports."
acceptance:
  - probe: command-registered
    name: "check.safety.validate"
---

# RFC-0302: Govern external site check safety, privacy, and consent

## Context

Check Webgogol can inspect websites outside the WGogol workspace. That makes safety and consent first-class architecture. A crawler that follows arbitrary links, stores screenshots with personal data, or ignores robots policy would be dangerous and reputationally unacceptable.

## Problem

External checking creates risks:

- crawling hosts the user did not intend to check;
- hitting pages too aggressively;
- storing cookies, credentials, form values, or personal data;
- bypassing robots policy without an owner-authorized reason;
- sending screenshots or page text to AI providers without consent;
- turning alt-host credentials into report artifacts.

## Decision

All check runs pass through `check.safety.validate` before capture or AI review.

Safety policy is explicit and conservative:

- public third-party targets respect robots by default;
- private alt targets require host allowlists;
- authentication uses secret references only;
- artifacts are redacted;
- AI review is opt-in per target;
- crawls never submit forms;
- external links are not followed unless explicitly allowed.

## Architectural fit

- RFC-0177 consent activation already treats third-party scripts and visitor privacy as safety boundaries.
- RFC-0181 forbids storage choices that cannot satisfy residency needs; this RFC avoids introducing persistent storage in the checker MVP.
- RFC-0214 separates proposing source descriptors from enabling monitoring. This checker is a one-shot target review, not a truth monitor.
- RFC-0294 capture and RFC-0296 artifacts enforce the policy.

## Design

### Safety Policy Defaults

```ts
export const DEFAULT_PUBLIC_CHECK_POLICY: CheckTargetPolicy = {
  respectRobots: true,
  allowScreenshots: true,
  allowAiReview: false,
  allowExternalLinks: false,
};

export const DEFAULT_PRIVATE_ALT_POLICY: CheckTargetPolicy = {
  respectRobots: false,
  allowScreenshots: true,
  allowAiReview: false,
  allowExternalLinks: false,
};
```

Private-alt mode may disable robots respect because the target is an owner-controlled pre-publication host. It still requires explicit `allowedHosts`.

### Hard Prohibitions

The runner must never:

- submit forms;
- click purchase, booking, unsubscribe, delete, or account actions;
- follow off-host links unless `allowExternalLinks` is true;
- store request cookies or authorization headers in artifacts;
- store input values from password, email, tel, textarea, or hidden fields;
- send screenshots/text to AI review unless `allowAiReview` is true;
- crawl beyond `maxPages`.

### Command

```sh
pnpm exec site-kernel run check.safety.validate --target ./check-targets/client.yaml --json
```

`check.run` and `check.evidence.capture` must call the same safety validator internally before doing network work.

### Diagnostics

| Rule | Severity | Meaning |
| --- | --- | --- |
| `CW-SAFE-01` | error | Target host is not in allowedHosts. |
| `CW-SAFE-02` | error | Auth config contains a raw secret instead of a secretRef. |
| `CW-SAFE-03` | error | AI review requested but target policy disallows it. |
| `CW-SAFE-04` | error | Public target attempts to disable robots without owner-authorized mode. |
| `CW-SAFE-05` | warning | Screenshots enabled for pages likely to contain personal data. |
| `CW-SAFE-06` | error | Artifact redaction scan found cookie, auth, or form-value leakage. |

## Rollout

1. Add safety policy defaults to target schema.
2. Implement `check.safety.validate`.
3. Make `check.run` and `check.evidence.capture` call it before network access.
4. Add artifact redaction scan into `check.artifact.validate`.
5. Add product UI warnings for AI review and screenshots.

## Alternatives considered

- **Trust the user-provided URL.** Rejected: redirects and links can leave the intended host.
- **Disable screenshots by default.** Rejected for value; screenshots are core evidence, but policy and redaction must govern them.
- **Allow AI review by default.** Rejected: sending website text/screenshots to a model is a separate consent decision.

## Risks

- **Safety friction slows dogfooding.** Mitigated by private-alt defaults and simple target files.
- **False PII positives.** Mitigated by warnings where uncertainty is high and errors for clear secret/auth patterns.
- **Policy bypass by direct child command use.** Mitigated by requiring capture command to call safety validation internally.

## Acceptance criteria

- [x] `check.safety.validate` is registered and has target-policy fixtures. (evidence: implemented historically)
- [x] `check.run` and `check.evidence.capture` refuse unsafe targets before network access. (evidence: implemented historically)
- [x] Raw secrets in target files fail validation. (evidence: implemented historically)
- [x] AI review cannot run unless target policy allows it. (evidence: implemented historically)
- [x] Artifact validation scans for auth/cookie/form-value leakage. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Treat safety failures as product bugs, not inconvenience.
- Never add a `--force` flag that bypasses host allowlists or raw-secret checks.
- Keep owner-authorized private alt checks explicit through target mode and policy.
