---
rfcId: RFC-0560
auditId: AUDIT-RFC-0560-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0560

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has several factual errors in codebase references (wrong file path for `mission.git.commit`, wrong `signBytes` parameter order, wrong CLI flag name), an unexplained env-var propagation mechanism that RFC-0559 does not define, and `commands.changed` lists two commands (`mission.reconcile`, `mission.close`) whose changes are not described in the RFC body.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0560 --json` returns zero violations.

## Axis A — Structural completeness

- **CLI surface — wrong flag name.** The RFC shows `--site warpgogol-com` (line 120) but the actual `mission.open` command uses `--system` as the flag name (`packages/os/site-kernel-handoff/src/mission/mission-open.ts:52`, `packages/os/site-kernel-handoff/src/mission/index.ts:66`). The CLI examples must use `--system`, not `--site`.
- **File system responsibilities — wrong file path.** The RFC attributes `mission.git.commit` to `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` (line 98, line 182). The actual handler `runMissionGitCommit` lives in `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts`. The file `mission-materialization-commands.ts` exists but does not contain `mission.git.commit`.
- **TypeScript contracts — wrong `signBytes` parameter order.** The RFC's `createSignedCommit` pseudocode shows `signBytes(sha, privateKeyHex)` (line 169). The actual signature is `signBytes(privateKeyHex: string, message: Uint8Array): Promise<string>` (`packages/passport/src/sign.ts:216`). The parameters are reversed, and the return type is `string` (multibase), not a raw signature.
- **Failure modes — missing exit codes.** The failure modes table describes error conditions (`actor-required`, `signing-key-invalid`) but does not specify exit codes. The existing codebase throws `Error` for validation failures (exit code 1). The RFC should state whether these are exit-code-1 failures or structured JSON errors.
- **Acceptance criteria — no criterion for `mission.reconcile` and `mission.close` changes.** These two commands are listed in `commands.changed` but have no corresponding acceptance criteria or design section. Either remove them from `commands.changed` or add design + criteria for their changes.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle) — satisfied correctly.** The RFC extends DNA-46 by making the `actor` field cryptographic. The `satisfies: [DNA-46]` entry is justified by the design: `mission.open` records VC subject id as actor, Bordbuch entries carry the same id. Existing missions with `actor: "agent"` remain valid — additive, not breaking.
- **DNA-34 (VC signing) — referenced in `related[]` but reclassified.** DNA-34 is "Reclassified to feature (RFC-0161) — governed as a product feature by RFC-0028, not enforced as binding DNA." The RFC correctly does not list it in `satisfies[]`. The reuse of `signBytes` is a code-level dependency, not a DNA invariant extension. No issue.
- **Amending RFC-0355 (archived/implemented).** RFC-0355 is in `docs/rfcs/archive/implemented/`. The `amends: [RFC-0355]` field is semantically correct — this RFC extends the actor field semantics without changing the mission lifecycle structure. No issue, but the author should confirm that amending an archived RFC is the correct governance path vs. a new standalone RFC that references it.

## Axis C — Ecosystem fit

- **Package boundaries — correct.** `packages/os/site-kernel-handoff` imports from `packages/passport` — this follows the `packages/* → packages/*` direction. No `apps/*` or `services/*` imports. No issue.
- **`packagesImpacted` — `packages/passport` should not be listed.** The RFC reuses the existing `signBytes` export from `@warpgogol/passport`. No new types, functions, or schema changes are proposed in `packages/passport`. The `ActorIdentity` and `SignedCommitResult` types are defined in `site-kernel-handoff`, not passport. Remove `packages/passport` from `packagesImpacted` unless a future revision adds passport-level types.
- **Compass sync — not addressed.** The RFC changes the semantics of the `actor` field in `mission.yaml` and Bordbuch entries. If `docs/source-markup.xml` or `docs/requirements.xml` track mission manifest field semantics, they may need synchronization. The RFC should state whether Compass XML updates are needed or explicitly mark them as not applicable.
- **AGENTS.md updates — not addressed.** `packages/os/site-kernel-handoff/AGENTS.md` documents the mission lifecycle and Bordbuch git synchronization. The actor field semantics change and the new `--actor-from-auth` flag should be reflected there. The RFC should identify this AGENTS.md update.
- **Command lifecycle — `commands.changed` has unexplained entries.** `mission.reconcile` and `mission.close` are listed as changed, but the RFC body does not describe any changes to them. Either remove them or add design sections explaining what changes.

## Axis D — Forward-only compliance

- **Backwards-compatible `--actor` flag — acceptable.** The RFC keeps `--actor` as a backwards-compatible flag for CLI direct access while adding `--actor-from-auth` for Studio Gate. This is not a dual-path — it's two input modes for the same field, with `--actor-from-auth` taking precedence. The existing `"agent"` default is replaced by `"unknown"` only when neither flag is provided, which is a semantic change but not a compatibility shim.
- **Actor default change from `"agent"` to `"unknown"` — not in rollout.** The file system responsibilities table (line 179) says the default becomes `"unknown"`, but the rollout section does not mention this change. Existing CLI workflows that omit `--actor` will get `"unknown"` instead of `"agent"` in Bordbuch entries. This is a breaking change for CLI direct access and should be explicitly called out in the rollout section.
- **No compatibility shim.** The RFC does not propose a bridge or dual-path. No issue.

## Axis E — Agent-facing policy

- **Status gate — correct.** The RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Anti-fabrication — addressed.** The RFC explicitly states "Agents MUST NOT fabricate actor identities when using `--actor-from-auth` — the env vars are set by Studio Gate auth middleware, not by the agent." Good.
- **Env var propagation mechanism — undefined in RFC-0559.** The RFC states "Studio Gate sets `WERKSTATT_ACTOR_ID` env var after successful auth, which mission commands read" (line 111). However, RFC-0559 does not define `WERKSTATT_ACTOR_ID` or any env-var-based propagation mechanism. RFC-0559's `StudioGateAuthResult` interface has `actorId`, `siteId`, `scopes` fields, but the RFC does not explain how these fields become env vars. Studio Gate is a stdio MCP server — does it spawn site-kernel as a child process with env vars? Does it pass them as command flags? This is a critical integration gap that must be resolved before implementation. The env-var contract should either be added to RFC-0559 (as an amendment) or defined in this RFC with a clear justification for why env vars are the chosen mechanism.
- **Storage policy — no cookies introduced.** No issue.

## Axis F — Pragmatism

- **`--actor-from-auth` flag — justified.** A separate flag is cleaner than overloading `--actor` with env-var detection logic. The precedence rule (`--actor-from-auth` > `--actor`) is explicit. No issue.
- **`Signed-off-by` trailer — semantic overload.** The RFC uses `Signed-off-by` as a trailer for Ed25519 signatures (line 170). `Signed-off-by` is a well-known git trailer with specific semantics (Developer Certificate of Origin). Overloading it with cryptographic signature data may confuse tools and humans. Consider using a distinct trailer like `X-Werkstatt-Signature` or `Werkstatt-Signature-By` to avoid semantic collision.
- **`createSignedCommit` uses `git commit --amend`.** The pseudocode shows a two-step process: commit, then amend to add trailers (line 170). This means the commit SHA changes after signing. The `SignedCommitResult.commitSha` should clarify that it's the post-amend SHA. Also, `--amend` rewrites the commit — if the workpiece is shared or pushed, this could cause issues. The RFC should note that `mission.git.commit` operates on a local workpiece that is not pushed until `mission.reconcile`.
- **Scope discipline — `packagesImpacted` includes `packages/passport` unnecessarily.** See Axis C.

## Axis G — Blind spots

- **Performance — not addressed for commit signing.** Ed25519 signing is ~1ms (as RFC-0558 notes for VC verification). The RFC does not mention the performance cost of `git commit --amend` (which creates a new commit object). For a typical mission with 10-50 commits, this is negligible, but the RFC should state it.
- **Edge case — empty workpiece commit.** The existing `mission.git.commit` handles the "no changes" case (line 166-177 of `mission-git-commit.ts`). The RFC's `createSignedCommit` pseudocode does not address this case. Should an empty commit be signed? The RFC should specify behavior for the no-changes case.
- **Edge case — `PASSPORT_SIGNING_KEY` set but actor not from auth.** If an operator runs `mission.git.commit` via CLI with `PASSPORT_SIGNING_KEY` set but without `--actor-from-auth`, what actor id is used for the signature? The RFC's `createSignedCommit` takes `actorId` as a parameter, but the source of `actorId` in CLI mode is unclear. Is it the `--actor` flag value? The mission manifest's `openedBy` field?
- **Security — private key in env var.** The RFC reuses `PASSPORT_SIGNING_KEY` (already used by passport signing). If both passport build signing and mission commit signing use the same key, a compromised mission workflow could leak the key that also signs build provenance. The RFC should address whether the same key should be used for both purposes or whether mission commit signing should use a separate key.
- **Migration path — existing open missions.** If an operator has an open mission with `actor: "agent"` and then bootstraps identity, subsequent `mission.git.commit` calls will sign commits with the new key. The Bordbuch entry for `mission-open` will have `actor: "agent"` but commit signatures will reference a VC subject id. The RFC should note this mixed-state scenario.

## Questions for the author

1. How does Studio Gate propagate auth context to site-kernel commands? RFC-0559 defines `StudioGateAuthResult` with `actorId`/`siteId`/`scopes` but does not define `WERKSTATT_ACTOR_ID` env vars. Is the env-var contract defined here, in RFC-0559, or in a third place? Should RFC-0559 be amended to define the env-var propagation?
2. Why are `mission.reconcile` and `mission.close` listed in `commands.changed` when the RFC body describes no changes to them? Either add design sections or remove them from the list.
3. Should `Signed-off-by` be used as the trailer name for Ed25519 signatures, given its existing DCO semantics? Would a distinct trailer (`Werkstatt-Signature-By`) be cleaner?
