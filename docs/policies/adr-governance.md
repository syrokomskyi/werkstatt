# ADR Governance Protocol

ADR (Architectural Decision Record) is the lightweight decision log for local technical choices that do not need full RFC governance. ADR files live in `docs/adrs/` and are first-class Site OS artifacts.

## When to use an ADR

Use an ADR when the decision is local to one package, one app, or one narrow internal convention and does **not**:

- Add, remove, or change a Site OS command.
- Modify a DNA invariant or `AGENTS.md` rule.
- Establish a cross-workspace package boundary or contract.
- Change a currently accepted or implemented RFC.

If any of the above is true, use the RFC process instead.

## ADR lifecycle (RFC-0367 — full RFC parity)

```
proposed ──► reviewing ──► accepted ──► implemented
any ────────► superseded (requires supersededBy pointing to the newer ADR)
any ────────► rejected
```

Only the named `decider` (usually `architecture`) may change ADR status. Agents may create ADRs in `proposed` status only. **Exception:** when the operator explicitly invokes `/fo-idea-implement` with an ADR id, the agent MAY transition `proposed` or `reviewing` → `accepted` → `implemented` as part of the implementation pipeline (RFC-0369).

## What an agent MAY do

- Create an ADR in `proposed` status using `adr.create`.
- Fill in the `Context`, `Decision`, `Justification`, `Consequences`, and `Evolution` sections of a proposed ADR.
- Reference an accepted ADR in commit messages when implementing the recorded decision.
- Run `adr.validate` to verify ADR files and `adr.list` to discover existing ADRs.

## What an agent MUST NOT do

- Change an ADR status to `accepted`, `superseded`, or `rejected` without the named decider approving it. **Exception:** when the operator explicitly invokes `/fo-idea-implement` with an ADR id, the agent MAY transition `proposed` or `reviewing` → `accepted` as part of the implementation pipeline (RFC-0369).
- Use an ADR for a command, policy, DNA, or cross-workspace decision that requires an RFC.
- Implement a decision while the ADR is still `proposed` (outside of the `/fo-idea-implement` exception above). A `proposed` ADR is not a license to change code.
- Allow implementation to reveal an RFC or DNA conflict without escalating via `rfc.supersede.propose` or by requesting a new RFC/ADR.

## How to create an ADR draft

When an agent identifies a local technical decision not covered by an existing accepted RFC or ADR:

```sh
rtk pnpm exec werkstatt run adr.create --title="Short imperative title" --scope=package
```

After creation:

1. Fill in the body sections.
2. Link to related RFCs/DNA using the `related` frontmatter field.
3. Run `adr.validate` to confirm the file is well-formed.
4. Do NOT change status past `proposed`.

## Transition to implemented

An ADR becomes actionable for code changes only when it reaches `accepted` status. Implementation commits should reference the ADR id. If the implementation reveals that the decision conflicts with a higher-level RFC or DNA invariant, stop and escalate rather than work around it. When `/fo-idea-implement` is invoked with an ADR id, the agent transitions the ADR through `accepted` → `implemented` and stamps `implementedAt` after the scoped build passes (RFC-0367, RFC-0369).
