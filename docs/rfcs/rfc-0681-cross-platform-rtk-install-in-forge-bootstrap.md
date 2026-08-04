---
id: RFC-0681
title: "Cross-platform RTK install in forge-bootstrap skill"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0374
  - RFC-0393
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge-bootstrap` skill installs RTK on Windows via PowerShell or cargo"
  - "`forge-bootstrap` skill installs RTK on Linux/macOS via curl or cargo"
  - "RTK install failure remains non-blocking on all platforms"
nonGoals:
  - "Bundling RTK binaries inside the forge npm package"
  - "Adding RTK as a forge dependency"
  - "Changing RTK configuration or initialization flow"
# acceptance:
#   - probe: file-contains
#     path: "packages/forge/skills/meta/forge-bootstrap/SKILL.md"
#     pattern: "PowerShell"
#   - probe: file-contains
#     path: "packages/forge/skills/meta/forge-bootstrap/SKILL.md"
#     pattern: "cargo install"
---

# RFC-0681: Cross-platform RTK install in forge-bootstrap skill

## Context

The `forge-bootstrap` skill (meta skill, `packages/forge/skills/meta/forge-bootstrap/SKILL.md`) includes a mandatory RTK (Rust Token Killer) setup step (§6.10). RTK is a CLI proxy that filters terminal command output before it reaches the LLM context.

The current install instructions (§6.10.2) are POSIX-only:

```
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
```

The section is titled "Install RTK (Linux/macOS)" — Windows is not mentioned. On Windows, `sh` is not available by default (only through Git Bash or WSL). The `curl` command exists on modern Windows 10+ but piping to `sh` fails.

The root `AGENTS.md` states: "`@warpgogol/forge` (published to npm) must remain cross-platform — it ships skills and command modules that consumers may run on Windows or Linux. Forge source and skills must not assume a POSIX-only environment."

The `cargo install --git` fallback already works cross-platform (if Rust/Cargo is installed), but it's presented as a secondary fallback, not as a primary Windows path.

## Problem

On Windows, the `forge-bootstrap` skill cannot install RTK using the primary `curl | sh` method. The operator must manually know to use `cargo` or install RTK through other means. This is a gap in Forge's cross-platform support.

## Decision

The RTK install step (§6.10.2) gains platform-aware instructions:

1. **Linux/macOS**: `curl | sh` (unchanged) with `cargo install` fallback.
2. **Windows**: `cargo install --git` as primary, with PowerShell-based download as secondary.
3. The section title changes from "Install RTK (Linux/macOS)" to "Install RTK (cross-platform)".

## Architectural fit

- **Root AGENTS.md cross-platform rule:** Forge must not assume POSIX-only. This RFC brings the RTK install step into compliance.
- **DNA-54 (Forge bindings contract):** No binding changes needed — RTK install is a skill instruction, not a forge.yaml binding.
- **`windows-ai-tooling` skill:** Already provides Windows tooling guidance. This RFC complements it by making the bootstrap skill itself Windows-aware.

## Design

### Updated §6.10.2 structure

The skill instruction changes from a single POSIX path to a platform-branched structure:

```markdown
#### 6.10.2. Install RTK (cross-platform)

Detect the platform via `process.platform` (or `uname` equivalent).

**Linux/macOS:**

```
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
```

If `curl` is unavailable or the script fails, try:

```
cargo install --git https://github.com/rtk-ai/rtk
```

**Windows (PowerShell):**

```
cargo install --git https://github.com/rtk-ai/rtk
```

If Cargo is not installed, download the prebuilt binary via PowerShell:

```powershell
Invoke-WebRequest -Uri "https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.exe" -OutFile "$env:USERPROFILE\.cargo\bin\rtk.exe"
```

If the prebuilt binary URL is unavailable or the download fails, note RTK as "not installed" and continue.
```

### Failure handling (unchanged)

If all methods fail on any platform, the skill logs the error silently, notes RTK as "not installed" in the welcoming report, and continues. RTK is non-blocking.

### Platform detection

The skill is an LLM-executed instruction set, not code. The agent executing `forge-bootstrap` detects the platform by running `process.platform` (Node.js) or `uname` (POSIX) or checking `$env:OS` (PowerShell). The skill instruction includes a brief detection note.

## Rollout

- **Skill-only change:** No forge source code (`src/`, `os/`) is modified. Only `packages/forge/skills/meta/forge-bootstrap/SKILL.md` changes.
- **Synced copy:** `.agents/skills/forge-bootstrap/SKILL.md` must be updated in the same commit.
- **No migration:** Existing Forge consumers are unaffected — the Linux/macOS path is unchanged.
- **No new commands:** No CLI commands are added or changed.

## Alternatives considered

- **WSL-only on Windows:** Require WSL2 for RTK on Windows. Rejected — adds a hard dependency on WSL2, which not all Windows users have. Cargo and prebuilt binaries work natively.
- **Skip RTK on Windows entirely:** Rejected — RTK's token optimization is valuable on all platforms. The operator should have the option.
- **Bundle RTK in forge npm package:** Rejected — RTK is a machine-level tool installed once, not a per-project dependency. Bundling would bloat the package.

## Risks

- **Prebuilt binary URL changes:** If the RTK project changes its release artifact naming, the PowerShell download URL breaks. Mitigation: `cargo install` is the primary Windows path; the prebuilt binary is a secondary fallback. Both failing is non-blocking.
- **Cargo not installed on Windows:** Rust/Cargo is not default on Windows. Mitigation: the PowerShell prebuilt binary path is the secondary fallback. If both fail, RTK is noted as "not installed" and the skill continues.
- **Agent mis-detects platform:** The skill instruction says "detect the platform" but the agent might get it wrong. Mitigation: the instruction lists both paths clearly — the agent can try `cargo install` on any platform as a universal fallback.

## Acceptance criteria

- [ ] §6.10.2 title in `packages/forge/skills/meta/forge-bootstrap/SKILL.md` changed from "Install RTK (Linux/macOS)" to "Install RTK (cross-platform)"
- [ ] Windows install instructions (cargo + PowerShell prebuilt binary) added to §6.10.2
- [ ] Linux/macOS instructions preserved unchanged
- [ ] Failure handling remains non-blocking on all platforms
- [ ] `.agents/skills/forge-bootstrap/SKILL.md` synced with the same changes
- [ ] `forge.skill.validate` passes on the updated skill
- [ ] `rfc.validate` passes on this RFC

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
-->
