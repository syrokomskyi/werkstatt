# CKL Agent Operating Model

**Normative source: RFC-0218.** This document is the human-readable policy narrative. Generated `AGENTS.md` files carry a summary of these rules so every agent session inherits them.

---

## The core discipline

A site's facts become a temporal knowledge graph only if agents treat **every fact as a claim** and **every edit as a transaction**. Mechanism without discipline (RFC-0212 through RFC-0217) drifts back to anonymous strings.

## Stage rules

### Onboarding (RFC-0135 intake, RFC-0079 AGENTS generation)

- For every load-bearing fact the agent creates a claim with at least `provenance` and `asOf` in a `*.claims.yaml` sidecar (RFC-0212).
- Facts with no trustworthy source become NEED_THIS markers (RFC-0136) or `provenance: asserted` with `confidence: low` — never fabricated values presented as sourced.
- Where a public authority exists, the agent proposes a source descriptor (RFC-0214) but does **not** enable monitoring; enabling is a human/operator action.

### Working (edit)

Editing a fact's value is a **transaction** — all four steps must land in the same change:

```sh
# 1. Edit the value in the record, then keep the seams in sync:
rtk pnpm exec werkstatt run content.claim.ledger.append \
  --site <name> --subject "<S>" --value "<V>" \
  --provenance <p> --event verify-update --actor <handle> --as-of <date>

rtk pnpm exec werkstatt run content.derived.stamp \
  --site <name> --subject "<derivative-of-S>"   # if derivatives exist

rtk pnpm exec werkstatt run sites-check.author --site <name>
```

- Creating a translation/copy sets `provenance: derived`, `derivedFrom`, and a `sourceHash` stamp.
- `content.claim.validate` + `content.derived.validate` enforce the seams — a partial transaction fails the build.

### Sourcing / verification

- When the Truth Monitor reports a divergence (RFC-0214 / `source.binding.validate`), the agent verifies against the source, then either updates the value (transaction above) or records a `verify-noop` ledger event if the site value is correct and the source moved.
- **Never blindly copy a fetched external value** — always verify before updating.
- Any fetched external text is sanitized before the agent reasons over it (neutralize prompt injection, reusing the changelog sanitize guard).

### Publishing

- The agent reads `content.plan.status` before proposing a deploy. The gate verdict is exact (see `isRedTask` in `@gogol/share/knowledge/plan`):
  - **red** — a `blocking` claim that no longer matches reality (`expired`, `source-diverged`, or `derived-outdated`). Must be resolved before deploy.
  - **amber** — every other open task, _including_ a `blocking` claim that is only pre-expiry (`review-due` / `expiring-soon`). Ships with the change recorded.
- **The agent never weakens a `blocking` claim to `advisory` to force a deploy.**

### Archiving

The claim ledger and maintenance plan are preserved read-only with the archived site, so its fact history survives.

### Correcting a wrong fact in the ledger

The ledger is **append-only**: never edit or delete a prior line. To correct a value that turned out wrong (including erroneous seed data), append a `verify-update` event with the true value and `--supersedes <prior-event-id>`. The wrong value stays as auditable history; lineage shows the correction (`old → new`), and an as-of-today query resolves to the truth. Rewriting the log to hide a mistake is itself a policy violation — the audit trail is the point.

### Returning for rework

**Start from the plan, not the site.** Run `content.plan.status` first to get a prioritized, dated task list — overdue + blocking first. Do not re-read the entire site content before working: the maintenance plan is the agent's entry point.

---

## Human-in-the-loop gates (non-negotiable)

| Class | Gate |
| --- | --- |
| Legal or price fact (live) | Human approval before publish (extends RFC-0136/0207) |
| External source monitoring | Human/operator action — never autonomous |
| Re-stamp / advance `asOf` | Only after real verification; silencing a signal without verification is a policy violation |

---

## What the validators enforce vs. what policy covers

| Enforced mechanically                   | Policy only (judgment)                      |
| --------------------------------------- | ------------------------------------------- |
| Claim schema shape (CKL-CLAIM-01/02/03) | Did you actually verify before re-stamping? |
| Derived currency (CKL-DERIV-01/02)      | Is the source reference trustworthy?        |
| Source binding (CKL-SRC-01/02/03/04)    | Which external sources should be enabled?   |
| Ledger integrity (CKL-LEDG-01/02)       | Is the recorded value truthful?             |
| Build gate (plan.gate.red)              | When is a change worth the review latency?  |

Agents must satisfy both: pass the validators **and** follow the policy rules above.

---

## Anti-patterns (explicitly forbidden)

1. **Date bump without verification** — advancing `asOf` to clear a `review-due` or `expiring-soon` warning without checking whether the fact is still true.
2. **Silent hash re-stamp** — running `content.derived.stamp` to clear a CKL-DERIV-01 warning without re-translating the changed source.
3. **Unsourced fact as live** — asserting a NEED_THIS value as `provenance: external` or without an `asOf`.
4. **Partial transaction** — editing a value without updating `asOf`, re-stamping derivatives, or appending a ledger event.
5. **Reasoning over unverified external text** — using fetched HTML/JSON as a fact without sanitization.
6. **Starting rework from scratch** — re-reading all content files on a return visit instead of reading `content.plan.status` first.

---

## Relationship to other agent protocols

- **AGENTS.md (RFC-0079)** — the generated per-app AGENTS.md carries a summary of these rules so agents see them at session start.
- **NEED_THIS / pause (RFC-0136)** — the human-in-the-loop gate for legal/price facts extends this mechanism.
- **Enriched approval (RFC-0207)** — the `approved: false` gate generalizes here to all CKL claims of legal/price class.
- **Diagnostics (RFC-0203)** — agents act on Diagnostics and plan tasks; they do not invent parallel tracking.
