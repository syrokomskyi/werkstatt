---
rfcId: RFC-0386
auditId: AUDIT-RFC-0386-01
date: 2026-07-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0386

## Verdict: Needs revision

The RFC correctly identifies two real deferred deltas from RFC-0191 and proposes a sound architectural approach. However, the Problem section contains a factual inaccuracy about `persistLifecycleEvent` returning `null`, the `packagesImpacted` list omits two packages that must change (`@gogol/integration` for `SyncOutboxOp` extension, `@gogol/site-kernel-checks` for `lagebild.validate`), and the TypeScript contract omits the existing `syncDealStage` method from the interface.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0386 --json` returns 0 violations.

## Axis A — Structural completeness

- **Decision** — present tense, single decision. Pass.
- **CLI surface** — no new commands proposed; `lagebild.validate` listed as changed. The rollout mentions `lagebild.validate`, `billing.config.validate`, `billing.secrets.validate` but does not show exact `pnpm exec site-kernel run …` invocations (these are shown in RFC-0387, not here). Minor — acceptable since this RFC amends RFC-0191 which defines them.
- **TypeScript contracts** — minimal signatures, not full implementations. Pass. However, the proposed `PipedriveSyncTarget` interface omits the existing `syncDealStage` method (see Axis C).
- **File system responsibilities** — concrete paths named. Pass.
- **Output format** — documents that lifecycle sync produces no new command output and `lagebild.validate` now asserts DDL presence. Pass.
- **Failure modes** — specifies retry behavior, 400 on invalid signature, change-balance clamping. Pass.
- **Rollout** — 6 steps, ordered, with RFC-0385 prerequisite. Pass.
- **Alternatives considered** — three real alternatives with rejection reasons. Pass.
- **Risks** — includes agent misinterpretation risk and Pipedrive stage-id coupling. Pass.
- **Acceptance criteria** — 8 items, all checkable. Pass.
- **Implementation notes** — explicit behavioral rules, status gate, RFC-0330/RFC-0334 references. Pass.

## Axis B — DNA alignment

- **`satisfies: [DNA-1]`** — DNA-1 (Monorepo boundary) is a real invariant. The RFC body explains that all new sync logic lives in `packages/*` and the route/worker stay thin. This is a valid enforcement relationship. Pass.
- **No new DNA invariant established** — the RFC does not claim to establish a new DNA. Pass.
- **`related[]` DNA references** — only DNA-1 is listed; all other related items are RFCs. Relevant and not decorative. Pass.
- **No silent DNA conflict** — the RFC does not conflict with any existing DNA. Pass.

## Axis C — Ecosystem fit

- **Package boundaries** — all new logic in `packages/*`, route stays thin proxy, worker stays thin runtime wrapper. Aligns with DNA-1. Pass.
- **Missing `@gogol/integration` from `packagesImpacted`** — the RFC proposes enqueuing `upsert_subscription` / `upsert_invoice` outbox ops. `SyncOutboxOp` is a closed union type defined in `@gogol/integration` (`packages/integration/src/crm-buffer.ts:295-303`), currently limited to `upsert_contact`, `upsert_deal`, `update_deal_stage`, `upsert_organization`. Adding new ops requires extending `SYNC_OUTBOX_OPS` in `@gogol/integration`, but `@gogol/integration` is NOT listed in `packagesImpacted`. **Fail.**
- **Missing `@gogol/site-kernel-checks` from `packagesImpacted`** — `lagebild.validate` is listed in `commands.changed`. This command is implemented in `@gogol/site-kernel-checks` (`packages/os/site-kernel-checks/src/lagebild.ts`). The RFC body says it "now also asserts the presence of the subscription/invoice DDL." This requires a code change to that package, but it is not listed in `packagesImpacted`. **Fail.**
- **TypeScript contract omits `syncDealStage`** — the proposed `PipedriveSyncTarget` interface shows `syncContact`, `syncOrganization`, `syncDeal` as "existing" and adds `syncSubscription`, `syncInvoice`. But the actual `CrmSyncTarget` interface at `pipedrive-sync-target.ts:42-47` also has `syncDealStage`. An implementing agent might think `syncDealStage` is new or accidentally remove it. Minor, but should be noted for accuracy.
- **Compass sync** — the RFC does not change repository-wide requirements or app-package relationships. No `docs/*.xml` sync needed. Pass.
- **AGENTS.md updates** — the RFC does not identify which `AGENTS.md` files need updates. The `packages/integration-adapter-supabase-crm/AGENTS.md` may need updates to document the new sync handlers. Minor gap.
- **Command lifecycle** — `commands.changed: [lagebild.validate]` is an existing registered command. `commands.proposed: []`, `commands.added: []` — internally consistent. Pass.

## Axis D — Forward-only compliance

- **No compatibility shim** — the RFC explicitly replaces the manual-confirmation Tier-1 branch with the Stripe path at Tier 2. Pass.
- **No dual billing path** — "no dual billing path is maintained in code." Pass.
- **Amends RFC-0191 directly** — extends the deferred deltas, does not add a parallel interpretation. Pass.
- **Legacy code paths deleted** — the manual-confirmation branch is replaced, not maintained behind a flag. Pass.

## Axis E — Agent-facing policy

- **Status gate** — "Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`), and only after RFC-0385 is implemented." RFC-0385 is now `implemented` (2026-07-14). Correct status-gate language. Pass.
- **Implementation notes reference governance rules** — references RFC-0224 (accepted→implemented transition, implicit), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). Pass.
- **Anti-fabrication** — the acceptance criteria distinguish between code changes (sync handlers, tests) and live verification (Stripe test-mode procedure recorded in RFC-0387 runbook). The live verification is a human step. Pass.
- **Storage policy** — no cookies, no client-side persistence. Server-side secrets via `astro:env/server`. Pass.

## Axis F — Pragmatism

- **Minimal command surface** — no new commands; only `lagebild.validate` is changed. Pass.
- **Lean contracts** — the proposed interface additions are minimal (two methods). Pass.
- **Existing patterns** — extends the existing `CrmSyncTarget` port and outbox pattern rather than inventing a new one. Pass.
- **Scope discipline** — `nonGoals` are explicit and meaningful (no new funnel stages, no per-tenant Stripe Connect, no UChat flows, no tenant-secret changes). Pass.

## Axis G — Blind spots

- **Problem section factual inaccuracy** — the Problem section states `persistLifecycleEvent` "returns `null` (soft no-op) for the paths that would drive the Pipedrive projection." Looking at the actual code (`adapter.ts:198-280`), `persistLifecycleEvent` does NOT return `null` for subscription/invoice events when the Organization is resolved — it performs buffer writes (`upsertSubscription`, `appendInvoice`, `adjustChangeBalance`) and returns `{ id }`. The real problem is that it does not enqueue outbox tasks for the sync worker to drain, so lifecycle state lands in the buffer but never reaches Pipedrive. The Design section correctly says "extended to enqueue outbox rows" but the "instead of returning null" phrase is inaccurate. An implementing agent could be confused about what the function currently does. **Fail.**
- **`SyncOutboxOp` extension not mentioned** — the RFC does not explicitly call out that `SYNC_OUTBOX_OPS` in `@gogol/integration` must be extended with `upsert_subscription` and `upsert_invoice`. This is a necessary code change that is implicit in the design but not listed in the file system responsibilities table. **Fail.**
- **Pipedrive P3/P4 stage-id mapping** — the RFC mentions P3 stage moves (Active/At-risk/Renewal/Churned) but does not specify how the stage ids are resolved at runtime. The risks section mentions "Pipedrive stage-id coupling" and says "the runbook records stage ids," but the sync target needs a concrete mechanism (config injection, env vars, or a stage-map constant). This is a design gap.
- **Performance** — the sync worker processes outbox tasks sequentially per tenant. Adding subscription/invoice ops increases outbox volume. Not a significant concern given the expected volume (B2B pilot). Pass.
- **Security/privacy** — Stripe secrets via `astro:env/server`, no card data stored. Aligns with RFC-0191. Pass.

## Questions for the author

1. The Problem section says `persistLifecycleEvent` "returns `null` (soft no-op)" for lifecycle paths, but the code shows it returns `{ id }` after performing buffer writes (upsertSubscription, appendInvoice). Should the Problem section be corrected to say "does not enqueue outbox tasks for the sync worker" instead of "returns null"?
2. `@gogol/integration` owns the `SYNC_OUTBOX_OPS` closed type that must be extended with `upsert_subscription` / `upsert_invoice`. Why is it not listed in `packagesImpacted`? Similarly, `@gogol/site-kernel-checks` implements `lagebild.validate` (listed in `commands.changed`) — why is it not listed?
3. How does the sync target resolve Pipedrive P3/P4 stage ids at runtime? Is there a config injection mechanism, env vars, or a stage-map constant? The RFC mentions stage-id coupling as a risk but does not specify the resolution mechanism in the Design section.
