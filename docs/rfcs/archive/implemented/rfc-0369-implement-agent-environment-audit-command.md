---
id: RFC-0369
title: "Implement agent.environment.audit command"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
implementedAt: 2026-07-09
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0368
amendedBy: []
related:
  - RFC-0368
  - DNA-2
  - DNA-35
  - RFC-0336
  - RFC-0265
  - RFC-0218
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
commands:
  proposed: []
  added:
    - agent.environment.audit
  # RFC-0369 implementation: command registered in @gogol/site-kernel-checks.
  changed: []
  removed: []
appsImpacted:
  - apps/*
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Agents can run a single command and receive a deterministic JSON report of tool availability."
  - "The audit output can be pasted into an agent system prompt as a machine-specific allow-list."
  - "Missing or misconfigured tools are reported with actionable installation or remediation hints."
nonGoals:
  - "Do not install, repair, or mutate the environment; the command is read-only."
  - "Do not replace the interactive windows-ai-tooling skill; the command is a probe, not a wizard."
  - "Do not gate build pipelines on audit results; it remains an advisory, on-demand command."
  - "Do not implement Linux/macOS-specific detection beyond what naturally works via the same Node APIs."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "agent.environment.audit"
  - probe: run
    command: "site-kernel run agent.environment.audit --json"
    expect:
      exitCode: 0
  - probe: file-exists
    path: "packages/os/site-kernel-checks/src/agent-environment-audit.ts"
  - probe: file-contains
    path: "AGENTS.md"
    pattern: "agent.environment.audit"
---

# RFC-0369: Implement agent.environment.audit command

## Context

RFC-0368 established the Windows agent tooling parity policy and reserved the name `agent.environment.audit` as a proposed, optional Site OS command. The policy defines three tiers of tools (native Windows, Git Bash POSIX coreutils, WSL2 Ubuntu) and a command matrix that agents must follow, but it leaves the actual discovery of the environment to manual checks such as `Get-Command` or the interactive `windows-ai-tooling` skill.

The missing piece is a deterministic, machine-readable probe that an agent can run at the start of a session and paste into its own system prompt. This command makes the abstract policy concrete: instead of guessing whether `bash` is Git Bash or WSL, or whether `jq` is installed natively, the agent receives a single JSON envelope that answers these questions.

## Problem

Three failure modes recur in agent sessions on Windows:

1. **Tool availability is guessed.** Agents assume `grep`, `find`, `sed`, `awk`, or `jq` are available in PowerShell because they are available in training data, then issue commands that fail.
2. **Shell provenance is ambiguous.** The same token `bash` can mean Git Bash, WSL, or a missing executable, and agents choose the wrong invocation for the available flavor.
3. **Environment state is not machine-readable.** Manual `Get-Command` checks are not structured, cannot be cached in a system prompt, and do not include tier classification or remediation hints.

## Decision

The Site OS gains the `agent.environment.audit` command. It scans the local environment, classifies each checked tool by the RFC-0368 tier, and emits a structured JSON report that agents can consume directly. The command is read-only, advisory, and never mutates the environment or blocks a build.

## Architectural fit

- **DNA-2 (pnpm workspace + Turborepo).** The command runs from the repository root and detects the tools an agent needs to execute cross-workspace commands reliably.
- **DNA-35 (`app.contract.full`).** A readiness signal that fails because an agent cannot run `jq` or `grep` is an environment defect; this command exposes that defect before the agent acts on it.
- **RFC-0368 (Windows tooling parity).** The command implements the optional probe proposed by the policy and uses the same tier definitions and command matrix.
- **RFC-0336 (`.gitattributes` governance).** The audit verifies that the committed `.gitattributes` contains the canonical line-ending rule, preventing silent line-ending drift.
- **RFC-0265 (agent commit hygiene).** A predictable environment reduces noisy agent commits caused by failed tool invocations.
- **RFC-0218 (CKL agent operating model).** The audit result is an asserted, machine-checkable fact for agent memory.

## Design

### CLI surface

```sh
pnpm exec site-kernel run agent.environment.audit
pnpm exec site-kernel run agent.environment.audit --json
pnpm exec site-kernel run agent.environment.audit --emit-prompt
```

- `--json`: emit the structured report.
- `--emit-prompt`: append a system-prompt snippet that lists the exact tools available on this machine.
- No `--app` flag; the command is workspace-scoped and detects the environment of the invoking shell.

### TypeScript contracts

```ts
interface AgentEnvironmentAuditResult {
  command: "agent.environment.audit";
  status: "ok" | "degraded";
  os: "win32" | "linux" | "darwin";
  shell: {
    name: string;
    path?: string;
  };
  tools: Record<string, ToolAuditEntry>;
  gitattributes: {
    present: boolean;
    path: string;
    lineEndingRule: boolean;
  };
  systemPromptSnippet?: string;
}

interface ToolAuditEntry {
  present: boolean;
  tier: "native" | "git-bash" | "wsl" | "not-available";
  source?: string;
  version?: string;
  defaultDistro?: string;
  installHint?: string;
  error?: string;
}
```

### Tool matrix and detection strategy

| Tool     | Tier            | Detection method                           |
| -------- | --------------- | ------------------------------------------ |
| `git`    | native          | `git --version`                            |
| `node`   | native          | `node --version`                           |
| `npm`    | native          | `npm --version`                            |
| `pnpm`   | native          | `pnpm --version`                           |
| `python` | native          | `python --version` or `python3 --version`  |
| `jq`     | native/WSL      | `jq --version`                             |
| `curl`   | native/WSL      | `curl --version`                           |
| `docker` | native          | `docker --version`                         |
| `wsl`    | WSL bridge      | `wsl --list --verbose`                     |
| `bash`   | Git Bash or WSL | `bash --version`, path analysis for flavor |

- A tool is `present: true` only when the executable can be located in `PATH` and returns a version.
- `bash` is classified as `git-bash` when its path contains the Git for Windows installation directory, otherwise `wsl` if `wsl --version` succeeds.
- `wsl` reports `defaultDistro` from `wsl --list --verbose`.
- Missing tools include an `installHint` drawn from the verified commands in RFC-0368 (e.g. `winget install -e --id jqlang.jq`).

### `.gitattributes` check

The command reads `AGENTS.md` and `.gitattributes` from the repository root and verifies that `.gitattributes` contains:

```gitattributes
* text=auto eol=lf
```

If the rule is missing, the result `status` becomes `degraded` and `gitattributes.lineEndingRule` is `false`, but the command still exits `0`. The command never rewrites `.gitattributes`; that remains a human or RFC-amendment action.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/agent-environment-audit.ts` | Command implementation |
| `packages/os/site-kernel-checks/src/module.ts` (or command table) | Command registration |
| `AGENTS.md` | Documents when and how agents should run the audit |
| `.gitattributes` | Read-only verification target |

### Output format

```json
{
  "command": "agent.environment.audit",
  "status": "ok",
  "os": "win32",
  "shell": { "name": "powershell", "path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" },
  "tools": {
    "git": { "present": true, "tier": "native", "source": "C:\\Program Files\\Git\\cmd\\git.exe", "version": "2.47.0" },
    "node": { "present": true, "tier": "native", "source": "C:\\Program Files\\nodejs\\node.exe", "version": "v22.11.0" },
    "wsl": { "present": true, "tier": "wsl", "version": "2.3.26.0", "defaultDistro": "Ubuntu" },
    "bash": { "present": true, "tier": "git-bash", "source": "C:\\Program Files\\Git\\bin\\bash.exe" },
    "jq": { "present": false, "tier": "not-available", "installHint": "winget install -e --id jqlang.jq" }
  },
  "gitattributes": {
    "present": true,
    "path": "C:\\projects\\webgogol\\webgogol-4\\.gitattributes",
    "lineEndingRule": true
  },
  "systemPromptSnippet": "..."
}
```

### Failure modes

- **Missing tool:** reported as `present: false` with `tier: "not-available"` and an `installHint`. Exit code remains `0`.
- **WSL not installed or misconfigured:** `wsl` entry reports `present: false` and `error` describes the failure.
- **`.gitattributes` missing or missing line-ending rule:** `status` becomes `degraded`; no remediation is performed automatically.
- **Internal detection error:** a per-tool `error` field contains the message; the command continues for remaining tools.
- **Execution with `--emit-prompt` but no `--json`:** prints the plain-text prompt snippet suitable for pasting into a system prompt.

## Rollout

1. **Register the command** in `@gogol/site-kernel-checks` command table (or module). It is available workspace-wide immediately after the package is rebuilt/reloaded.
2. **Document in `AGENTS.md`.** Add a note in the Windows tooling section that agents should run `agent.environment.audit` at the start of Windows sessions and include the output in the system prompt.
3. **Update `windows-ai-tooling` skill.** The skill may invoke the audit before generating the machine-specific allow-list, using the JSON result instead of duplicating detection logic.
4. **No pipeline integration.** The command stays out of `build.prepare` / `build.check` by default. A future RFC may add an optional gate if needed.

## Alternatives considered

- **Shell script instead of TypeScript command.** Rejected because a Node-based command is cross-platform, easier to maintain, and can reuse existing `@gogol/share` utilities and the kernel logger.
- **Inline detection inside the `windows-ai-tooling` skill only.** Rejected because a skill is user-invoked and not available to every agent session; a Site OS command is accessible to all agents and CI.
- **Make the command fail hard on missing tools.** Rejected because environment state varies across machines; an advisory report lets operators decide what to install.
- **Add Linux/macOS-specific install hints.** Rejected as out of scope; the primary gap is Windows, and the same Node APIs already produce correct results on POSIX systems without extra hints.

## Risks

- **Agent over-reliance on the report.** The output is a snapshot, not a guarantee. Agents must still stop and ask the operator when a required tool is missing.
- **PATH mismatch between audit shell and IDE shell.** The command detects the environment of the shell that invokes it. If the IDE terminal has a different `PATH` than the audit shell, the report may be misleading. Documentation will recommend running the audit from the same terminal used for development.
- **Install hints drift.** Winget IDs and package names change. Hints are best-effort suggestions, not canonical URLs.
- **Performance on slow machines.** Spawning many child processes can be slow; checks should run concurrently with a short timeout per tool.

## Acceptance criteria

- [x] `agent.environment.audit` is registered in the Site OS command manifest. (evidence: implemented historically)
- [x] Running the command with `--json` emits a valid `AgentEnvironmentAuditResult` with `command`, `status`, `os`, `shell`, `tools`, and `gitattributes` fields. (evidence: implemented historically)
- [x] The command correctly classifies Git Bash vs. WSL `bash` on Windows. (evidence: implemented historically)
- [x] Missing tools include an actionable `installHint` from the RFC-0368 command matrix. (evidence: implemented historically)
- [x] `AGENTS.md` references the command in the Windows tooling section. (evidence: AGENTS.md:1, agent guide updated)
- [x] The RFC passes `rfc.validate` before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents **MAY** run `agent.environment.audit` at the start of any Windows session and **SHOULD** include the result in the system prompt.
- Agents **MUST NOT** use the command to install, repair, or modify the environment.
- Agents **MUST NOT** gate build pipelines on audit results unless a superseding RFC explicitly adds that gate.
- Agents **SHOULD** stop and ask the operator when a tool they need is `present: false` and no safe fallback exists.
- If implementation reveals a conflict with RFC-0368 (e.g. a tier classification must change), agents **MUST** escalate via `site-kernel run rfc.supersede.propose` rather than silently diverge (RFC-0334).

---

## Post-implementation note: Linux migration (2026-07-22)

The command was rewritten for Linux-only operation after the monorepo migrated from Windows to Ubuntu. The following changes were made:

- `ToolTier` simplified from `"native" | "git-bash" | "wsl" | "not-available"` to `"native" | "not-available"`.
- `AgentEnvironmentAuditResult.os` narrowed from `"win32" | "linux" | "darwin"` to `"linux" | "darwin"`.
- Removed `defaultDistro` field, `classifyBash`, `findGitBash`, `parseWslDefaultDistro`, `cleanOutput` (UTF-16LE), and PowerShell/CMD shell detection.
- `wsl` and `bash` special handling removed from `TOOL_SPECS`; `winget` install hints replaced with `apt` commands.
- `resolveToolPath` uses `which` directly (no `where` fallback).
- `detectShell` only handles POSIX shells via `process.env.SHELL`.

The command remains advisory, read-only, and never gates build pipelines. See `docs/policies/linux-tooling.md` for the current tool inventory.
