---
rfcId: RFC-0379
auditId: AUDIT-RFC-0379-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0379

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has two failures on axes B and D: it silently removes `vercel` from the adapter enum without justification, and it does not call out that DNA-49's descriptive text ("MVP: Cloudflare Pages") becomes stale after the `cloudflare-pages` removal. A pragmatism finding on missing adapter interface updates further weakens implementation readiness.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec site-kernel run rfc.validate RFC-0379 --json` returns zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. The Decision is a single present-tense statement. CLI surface shows exact invocations with `--channel` flags. TypeScript contracts are minimal signatures. File system responsibilities table names concrete paths. Output format documents the `--json` shape with `propagation`, `channel`, `preflight`, and `health` objects. Failure modes specify exit codes and state transitions. Rollout notes the registry is empty (`systems: []`), making this the cheapest moment for the breaking schema change. Alternatives considered has four real alternatives with rejection reasons. Risks include agent misinterpretation risk. Acceptance criteria are checkable and cover the full scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**Finding B-1: DNA-49 descriptive text becomes stale.** `docs/architecture-dna.md` DNA-49 says "via adapter plugins (MVP: Cloudflare Pages)". This RFC removes `cloudflare-pages` from the adapter enum and establishes `cloudflare-workers` as the only concrete adapter. The RFC's `satisfies: [DNA-49]` is correct and the amendment mechanism (amending RFC-0358, which established DNA-49) is appropriate. However, the RFC does not call out that the DNA-49 parenthetical "(MVP: Cloudflare Pages)" in `docs/architecture-dna.md` must be updated to "(MVP: Cloudflare Workers)" as part of implementation. Without this, the canonical DNA registry carries a factual error after implementation.

## Axis C — Ecosystem fit

**Finding C-1: AGENTS.md update target not identified.** The Risks section mentions "AGENTS.md rule below" referring to the rule that agents must not write `deployment.lastPropagated` outside the Leitstand command handlers. However, the RFC does not explicitly identify which `AGENTS.md` file(s) should carry this rule. Given that the Leitstand lives in `packages/os/site-kernel-handoff`, the rule likely belongs in `packages/AGENTS.md` or the root `AGENTS.md` deployment section. The RFC should name the target file.

No other issues. Package boundaries are correct (`packages/*` only). No pipeline placement needed (workspace-scoped CLI commands, not pipeline validators). Cosmic naming is N/A. Command lifecycle buckets are internally consistent — the four commands were added by RFC-0358 and are correctly listed under `changed`.

## Axis D — Forward-only compliance

**Finding D-1: Silent removal of `vercel` from adapter enum.** The existing `deploymentAdapterNameSchema` in `@gogol/ontology/src/operations/leitstand.ts:15-20` is `z.enum(["cloudflare-pages", "cloudflare-workers", "netlify", "vercel"])`. The RFC proposes `z.enum(["cloudflare-workers", "netlify", "null"])`. The RFC explains the removal of `cloudflare-pages` (RFC-0149 retired the Pages form) and the addition of `null` (test fixture). However, `vercel` is also removed without any explanation in the Decision, Alternatives, or Rollout sections. A value removal from a closed enum (DNA-19) requires explicit justification — the RFC must either keep `vercel` in the enum or explain why it is removed in this wave.

## Axis E — Agent-facing policy

No issues. The RFC is `status: draft` and contains no self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), and RFC-0330 (verification evidence). No content authoring in acceptance criteria. No cookies or client-side persistence touched.

## Axis F — Pragmatism

**Finding F-1: `@gogol/fingerprint` in `packagesImpacted` is overly broad.** The RFC lists `@gogol/fingerprint` in `packagesImpacted`, but no source files in `packages/fingerprint/` are modified by this RFC. The RFC consumes `@gogol/fingerprint` for health-check normalization and dist staleness detection, and `@gogol/site-kernel-handoff` already lists it as a dependency. `packagesImpacted` should list only packages whose source files are changed.

**Finding F-2: Updated adapter interface not shown.** The current `PropagateInput` in `packages/os/site-kernel-handoff/src/leitstand/adapter.ts:15-22` carries `target: string` and `credentials: Record<string, string>`. The channel model replaces these with `workerName`, `url`, and `secretsFile` per channel. The RFC shows the new `deploymentChannelSchema` and the adapter factory signature `createCloudflareWorkersAdapter(exec?: CommandRunner): DeploymentAdapter`, but does not show the updated `PropagateInput` / `RollbackInput` / `HealthInput` interfaces. An implementer would need to infer the new interface shape from the schema and the adapter description. The RFC should show the minimal updated interface signatures.

## Axis G — Blind spots

**Finding G-1: `secretsFile` resolution path underspecified.** The `deploymentChannelSchema` has `secretsFile: secretRefSchema.optional()` with comment `// e.g. "env:WERKSTATT_SECRETS_MAIN" -> resolved to a local path`. The preflight checks that "referenced secrets files exist locally and are gitignored." However, the RFC does not describe the resolution mechanism: how does `env:WERKSTATT_SECRETS_MAIN` become a file path? The existing `secretRefSchema` resolves `env:NAME` to `process.env.NAME` (a value), but here the env var is expected to contain a file path, not a secret value. The RFC should clarify whether this is a new resolution kind or a convention on top of the existing `env:` kind, and where the resolution code lives (adapter-internal or shared in `@gogol/site-kernel-deploy`).

No other issues. Health checks are bounded (default 10 routes, 5 attempts over ~2 minutes). False positives are addressed by distinguishing `unknown` (network) from `unhealthy` (content mismatch). Edge cases for empty states (no `alt` channel → direct to `main`), concurrent execution (RFC-0362 locks), and interrupted operations are handled. Migration path is documented (empty registry, no data migration). Security/privacy is thoroughly addressed (secret references only, redaction as tested invariant, gitignored secrets files).

## Questions for the author

1. Why is `vercel` removed from the adapter enum? If the intent is to prune unused values, state this explicitly in the Decision or Alternatives section. If it should be retained, add it back to the proposed enum.
2. Where does the `secretsFile` reference resolution code live, and how does `env:WERKSTATT_SECRETS_MAIN` resolve to a file path rather than a secret value? Is this a new resolution kind or a convention on top of the existing `env:` kind?
3. What are the updated `PropagateInput`, `RollbackInput`, and `HealthInput` interface signatures after the channel model is introduced? The current interfaces carry `target: string` and `credentials: Record<string, string>` — the implementer needs to know which fields are replaced by channel-derived values.
