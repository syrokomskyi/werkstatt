---
id: RFC-0368
title: "Establish Windows agent tooling parity and command allow-list"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
amends: []
amendedBy:
  - RFC-0369
  - RFC-0374
related:
  - DNA-2
  - DNA-35
  - RFC-0336
  - RFC-0265
  - RFC-0218
commands:
  proposed: []
  added:
    - agent.environment.audit
  changed: []
  removed: []
appsImpacted:
  - apps/*
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-onboarding"
successSignals:
  - "Every AI agent working on this monorepo on Windows knows exactly which shell commands it may use natively, which must go through WSL, and which are unavailable."
  - "New contributors and CI agents can reproduce the Windows tooling baseline in minutes using a single interactive skill."
  - "Line-ending and cross-platform Git issues are eliminated by a committed, machine-managed `.gitattributes` contract."
  - "Repository documentation no longer assumes POSIX-only tools; agent prompts include the Windows command matrix."
nonGoals:
  - "Do not replace WSL with PowerShell-native rewrites of POSIX tools; the goal is parity, not platform lock-in."
  - "Do not mandate Chocolatey or Scoop as primary package managers; winget is the default Windows delivery path."
  - "Do not change the existing Linux/macOS development workflow; this RFC only closes the Windows gap."
  - "Do not implement the proposed OS commands before acceptance; they remain optional probes."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: file-exists
    path: "AGENTS.md"
    pattern: "Windows agent tooling"
  - probe: file-exists
    path: ".gitattributes"
    pattern: "* text=auto eol=lf"
  - probe: file-exists
    path: ".agents/skills/windows-ai-tooling/SKILL.md"
    pattern: "Windows AI tooling"
---

# RFC-0368: Establish Windows agent tooling parity and command allow-list

## Context

This monorepo is developed primarily on Windows workstations, but the AI agents that edit it were trained on documentation and examples that assume a POSIX environment. The result is a recurring failure mode: agents issue commands such as `grep`, `find`, `sed`, `awk`, or `jq` directly in PowerShell, then retry with fragile `cmd /c` wrappers or give up and ask the operator. The same agents do not know whether `bash` means Git Bash, WSL, or a non-existent shell, and they treat Windows paths as if they were valid inside WSL without `wslpath` conversion.

Repository-wide conventions already prevent some categories of drift: `DNA-2` mandates pnpm/Turborepo from the repository root, `DNA-35` defines `app.contract.full` as the single readiness signal, and `RFC-0336` governs generated files and `.gitattributes`. None of these invariants address the _agent environment_ itself. The missing layer is a documented, reproducible Windows tooling baseline that agents can discover and follow.

## Problem

Three unprotected invariants create the gap:

1. **No command allow-list.** Agents do not know which tools are installed on a Windows box, so they guess. Guessing produces `bash.exe.stackdump` files, broken path references, and unnecessary WSL installs proposed as fixes.
2. **No documented path translation discipline.** Agents routinely pass `C:\projects\...` into WSL commands or expect `/mnt/c/...` paths to work in Git Bash. The conversion rules are simple but unwritten.
3. **No onboarding path for Windows AI projects.** `setup-matt-pocock-skills` configures issue trackers and triage labels for this repo, but there is no reusable skill that bootstraps a _generic_ Windows project for AI agents, including a line-ending-safe `.gitattributes` and a verified command matrix.

## Decision

The repository adopts a Windows agent tooling parity policy: every AI agent that works on this monorepo receives an explicit command matrix that maps POSIX-style requests to their real Windows counterparts. The baseline is delivered through a combination of winget-installed native tools, a WSL2 Ubuntu bridge for everything else, and a committed `.gitattributes` contract. A standalone interactive skill, `windows-ai-tooling`, installs and documents this baseline for any project, even when that project has no `AGENTS.md` yet.

## Architectural fit

- **DNA-2 (pnpm workspace + Turborepo).** All cross-workspace commands run from the repository root. On Windows, `pnpm` is installed via winget, so the workspace entry point is already Windows-compatible once the baseline is present.
- **DNA-35 (`app.contract.full`).** A readiness signal that fails because an agent cannot run `jq` or `grep` is not a code defect; it is an environment defect. The policy makes the environment part of the readiness signal.
- **RFC-0336 (`.gitattributes` governance).** Windows line-ending drift is eliminated by extending the same generated-file discipline to source files: `* text=auto eol=lf` plus explicit per-extension rules.
- **RFC-0265 (agent commit hygiene).** A predictable environment makes agent commits more reliable; agents that cannot run their own lint helpers produce noisier history.
- **RFC-0218 (CKL agent operating model).** The policy is itself a load-bearing fact for agent behavior: it must be treated as `asserted` provenance in agent memory and updated through the RFC amend cycle.

## Design

### Tooling tiers

| Tier | Delivery | Examples | When an agent uses them |
| --- | --- | --- | --- |
| **Native Windows** | winget or built-in | `git`, `node`, `npm`, `python`, `jq`, `curl`, `docker`, `wsl` | Directly in PowerShell/CMD without prefixes. |
| **Git Bash POSIX coreutils** | Shipped with `Git.Git` | `bash`, `grep`, `sed`, `awk`, `find`, `tar`, `ls`, `xargs` | Through `bash -c "..."` or Git Bash. Paths must stay Windows-style because Git Bash maps drives. |
| **WSL2 Ubuntu** | `wsl --install -d Ubuntu` | `apt` packages, GNU coreutils, build tools | Via `wsl <command>` or `wsl bash -c "..."`. Windows paths must be translated with `wslpath` first. |
| **Not available** | No known safe path | POSIX-only tools not in the tiers above | Agents must stop and ask the operator, or use the WSL bridge if equivalent package exists. |

### Verified Windows installation commands

All commands below are confirmed against the winget catalog and official documentation for Windows 10/11 (21H2+). Agents must prefer exact IDs (`-e --id`) to avoid ambiguity.

```powershell
# Tier 1 — native Windows tools via winget
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Python.Python.3
winget install -e --id jqlang.jq
winget install -e --id cURL.cURL
winget install -e --id Docker.DockerDesktop

# Tier 3 — WSL2 Ubuntu bridge
wsl --install -d Ubuntu
```

After WSL2 Ubuntu is installed and rebooted, the standard Ubuntu bootstrap applies:

```bash
sudo apt update && sudo apt install -y build-essential git curl wget jq python3 python3-pip nodejs npm
```

### Command matrix for agents

| What the agent wants | Safe Windows invocation | Lives in |
| --- | --- | --- |
| List files in detail | `ls` from WSL: `wsl ls -la` | WSL Ubuntu |
| Search text | `grep` from WSL: `wsl grep "error" /mnt/c/...` | WSL Ubuntu |
| Find files | `wsl find /mnt/c/project -name "*.ts"` | WSL Ubuntu |
| Parse JSON | `jq` from WSL: `wsl bash -c "cat file.json \| jq '.version'"` | WSL Ubuntu |
| Translate a Windows path for WSL | `wsl wslpath "C:\Users\user\data.txt"` | WSL Ubuntu |
| Run bash scripts | `bash -c "..."` (Git Bash) or `wsl bash -c "..."` | Git Bash / WSL |
| Run git commands | `git` directly | Native Windows |
| Run node/npm/pnpm | `node`, `npm`, `pnpm` directly | Native Windows |
| Run python/pip | `python`, `pip` directly | Native Windows |

Agents must **never** assume that `bash` in a PowerShell session is WSL. They must test first with `Get-Command bash -ErrorAction SilentlyContinue` and report the source.

### `.gitattributes` contract

The committed `.gitattributes` (already present) is the canonical line-ending rule. Agents must not alter it without an RFC amendment. It is treated as a load-bearing environment file:

```gitattributes
* text=auto eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.astro text eol=lf
*.css text eol=lf
*.json text eol=lf
*.md text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.mjs text eol=lf
*.cjs text eol=lf
*.js text eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.svg binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
```

Agents must also treat `*.svg` carefully: it is marked `binary` so that line-ending normalization does not corrupt embedded vector data, even though SVG is text-based.

### Proposed OS command surface

`agent.environment.audit` is a proposed optional Site OS command. It scans the environment and reports which tools are present, missing, or misconfigured, producing a JSON envelope that agents can paste into their own system prompt. It does not mutate state. It is **not** in the acceptance path until a separate command RFC is accepted; this policy RFC only reserves the name and behavior contract.

```sh
pnpm exec site-kernel run agent.environment.audit --json
```

Example output:

```json
{
  "command": "agent.environment.audit",
  "status": "ok",
  "tools": {
    "git": { "present": true, "source": "C:\\Program Files\\Git\\cmd\\git.exe" },
    "node": { "present": true, "source": "C:\\Program Files\\nodejs\\node.exe" },
    "wsl": { "present": true, "defaultDistro": "Ubuntu" },
    "bash": { "present": true, "flavor": "git-bash" },
    "jq": { "present": false, "install": "winget install -e --id jqlang.jq" }
  }
}
```

### Standalone interactive skill: `windows-ai-tooling`

A new user-invoked skill lives at `.agents/skills/windows-ai-tooling/SKILL.md`. It is designed to bootstrap _any_ Windows project for AI agents, not only this monorepo. It is interactive: it asks the operator which tools are already installed, runs the missing installations via winget/WSL, generates a project-local `.gitattributes` from a verified template, and emits a system-prompt snippet that lists the exact commands available on the machine.

The skill is documented in its own file and is part of the acceptance criteria for this RFC. It references the same command matrix and installation commands as this policy, so there is one source of truth.

## Rollout

1. **Immediate.** Merge the RFC and the skill. Add the Windows tooling section to `AGENTS.md` (or a child `AGENTS.md` if the nearest scope is more appropriate). The `.gitattributes` file is already correct; no change needed unless a new source extension is introduced.
2. **First week.** Every agent session on Windows begins with `agent.environment.audit` (or a manual equivalent) and the command matrix is included in the agent’s system prompt.
3. **Ongoing.** New source extensions added to `apps/` or `packages/` must also be added to `.gitattributes` with an explicit `eol=lf` rule. The `windows-ai-tooling` skill is the recommended onboarding path for any new project that will be edited by AI agents on Windows.

## Alternatives considered

- **Mandate WSL for everything.** Rejected. Native Windows tools (git, node, pnpm, docker) are faster and better integrated with the IDE. WSL is the bridge, not the default.
- **Mandate Chocolatey or Scoop instead of winget.** Rejected. winget is built into Windows 10/11 and is the path of least friction for new contributors. The skill may offer choco/scoop as an optional branch for advanced operators.
- **Provide a Docker-based dev container.** Rejected. Docker Desktop is listed as an optional tool, but requiring it raises the barrier too high for a policy whose goal is to make Windows AI editing reliable, not to standardize a Linux container.
- **Add a `.bashrc`/`.profile` polyfill.** Rejected. Agents must know the real environment, not a fake one. Polyfills hide tool provenance and make debugging harder.

## Risks

- **Agent hallucination of tool availability.** The command matrix helps, but agents may still assume a tool is installed. The proposed `agent.environment.audit` command is the guard; until it exists, operators must seed the system prompt with the output of `Get-Command`.
- **WSL path-translation errors.** A common failure is passing a Windows path to a WSL command without `wslpath`. The matrix explicitly calls this out, but agents need reinforcement in the system prompt.
- **Winget package drift.** IDs change over time. The skill must verify IDs against the live winget catalog before installing; the RFC lists the IDs as a snapshot, not a guarantee.
- **False sense of security from `.gitattributes`.** Line endings are only normalized at checkout and commit time. Mixed-history files may still contain CRLF; `git add --renormalize .` is the recovery path, documented in the skill.

## Acceptance criteria

- [x] `AGENTS.md` contains a "Windows agent tooling" section with the command matrix and WSL path-translation rules. (evidence: AGENTS.md:1, agent guide updated)
- [x] `.gitattributes` remains committed and includes the full source-extension line-ending rules shown in this RFC. (evidence: implemented historically)
- [x] `.agents/skills/windows-ai-tooling/SKILL.md` exists and is interactive, following the wizard/interactive pattern established by `setup-matt-pocock-skills` and `wizard`. (evidence: implemented historically)
- [x] The skill generates a project-local `.gitattributes` from a verified template and emits a machine-specific command allow-list for agent system prompts. (evidence: implemented historically)
- [x] The RFC passes `rfc.validate` before merging. (evidence: implemented historically)
- [x] (Optional) `agent.environment.audit` is registered as a proposed Site OS command in the kernel command manifest. (evidence: command registered in kernel module)

## Implementation notes for agents

- **MAY** use `wsl <command>` when the tool is listed as WSL-only in the matrix.
- **MAY** use `bash -c "..."` when running inside Git Bash; however, paths must remain Windows-style because Git Bash translates drives automatically.
- **MUST** convert Windows paths to WSL paths with `wslpath` before passing them to `wsl` commands.
- **MUST NOT** assume `grep`, `find`, `sed`, `awk`, `jq`, or `curl` exist in PowerShell unless they were installed natively and verified with `Get-Command`.
- **MUST NOT** modify `.gitattributes` without an RFC amendment or a human-approved content edit; the line-ending contract is load-bearing.
- **MUST** prefer exact winget IDs (`-e --id`) over fuzzy names when installing tools on Windows.
- **SHOULD** run the `windows-ai-tooling` skill for any new project that will be edited by AI agents on Windows, even if the project has no `AGENTS.md`.

---

## Post-implementation note: Linux migration (2026-07-22)

This RFC was written when the monorepo was developed on Windows. The monorepo has since migrated to Linux (Ubuntu) as the sole development environment. The policy and tooling tiers defined here **no longer apply to the monorepo itself** — all Windows-specific code, `shell: true` spawn workarounds, `pnpm.cmd` conditionals, and `windowsHide` options have been removed from `packages/os/**` and `services/**`.

**What remains in force:**

- The `windows-ai-tooling` skill lives in `packages/forge/skills/shared/` and is preserved for `@wgogol/forge` consumers who run on Windows (forge is published to npm and must remain cross-platform).
- The `.gitattributes` line-ending contract (LF for all source files) remains load-bearing.
- `agent.environment.audit` (RFC-0369) still exists but was rewritten for Linux-only operation.

See `docs/policies/linux-tooling.md` for the current Linux tool inventory and agent command rules.
