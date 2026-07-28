# Linux Development Tooling

This monorepo is developed on Linux (Ubuntu). AI agents can assume a POSIX environment with native GNU coreutils. For a generic, reusable setup path on Windows, run the `windows-ai-tooling` skill (shipped via `@warpgogol/forge`).

## Tool inventory

| Tool | Install (Ubuntu) | Used for |
| --- | --- | --- |
| `git` | `sudo apt install -y git` | Version control, mission workpiece git operations |
| `node` | `sudo apt install -y nodejs` (or NodeSource for LTS) | JavaScript/TypeScript runtime |
| `pnpm` | `corepack enable pnpm` | Package manager (preferred over npm) |
| `python3` | `sudo apt install -y python3` | Scripts, tooling |
| `jq` | `sudo apt install -y jq` | JSON parsing in shell |
| `curl` | `sudo apt install -y curl` | HTTP requests |
| `docker` | `sudo apt install -y docker.io` | Container builds (services) |
| `bash` | Pre-installed | Shell scripts, POSIX coreutils |
| `exiftool` | `sudo apt install -y libimage-exiftool-perl` | Material metadata validation |
| `build-essential` | `sudo apt install -y build-essential` | Native compilation (better-sqlite3, etc.) |
| Playwright Chromium | `pnpm exec playwright install chromium` | `print.pdf.generate` build step, `qa.independent.run` |

## Agent command rules

- **MAY** use POSIX tools (`grep`, `find`, `sed`, `awk`, `jq`, `curl`, `bash`) directly — they are all in PATH.
- **MUST NOT** use `wsl` or `wslpath` — WSL is a Windows-only concept.
- **MUST NOT** modify `.gitattributes` without an RFC amendment; the line-ending contract is load-bearing.
- **SHOULD** use `pnpm` for all package management commands.

## Environment audit

Agents **MAY** run `agent.environment.audit` at the start of any session and **SHOULD** include the result in the system prompt. The command is read-only, advisory, and never gates build pipelines.

```sh
pnpm exec site-kernel run agent.environment.audit --json
pnpm exec site-kernel run agent.environment.audit --emit-prompt
```

The `--emit-prompt` flag appends a `systemPromptSnippet` field and prints a plain-text snippet suitable for pasting into an agent system prompt. Missing tools include actionable `installHint` values with apt commands.

## System-level tuning for large monorepos

The monorepo has ~38 TypeScript packages plus Astro sites. On Linux, the main resource bottlenecks for IDE and build performance are `inotify` watcher limits, filesystem metadata I/O, and dirty-page flush behavior. The following system-level settings are **operator actions** (require `sudo`) — agents MUST NOT apply them automatically.

### inotify limits

The default `max_user_watches=8192` is too small for this monorepo. The current machine has `max_user_watches=524288`, `max_user_instances=1024`, `max_queued_events=65536`. If experiencing watcher exhaustion (IDE losing track of file changes, build tools reporting ENOSPC), raise `max_user_watches` to `1048576`:

```bash
sudo tee /etc/sysctl.d/40-inotify.conf >/dev/null <<'EOF'
fs.inotify.max_user_watches=1048576
fs.inotify.max_user_instances=1024
fs.inotify.max_queued_events=65536
EOF
sudo sysctl --system
```

Each watch costs ~1080 bytes of kernel memory on 64-bit Linux. With 1M watches, worst case is ~1 GB non-swappable kernel memory — acceptable on a dev machine with ≥16 GB RAM.

### Filesystem

- Keep the project, `pnpm` store, and build cache on local NVMe/SSD — not on network mounts or FUSE. TypeScript build latency is dominated by per-file I/O, not throughput.
- Consider `noatime` on the partition holding source code and caches to eliminate atime metadata writes on every file read. Check current mount options with `mount | grep $(df . --output=source | tail -1)`.
- Exclude generated directories from backup and indexing tools: `dist`, `.turbo`, `.astro`, `coverage`, `.cache`, `node_modules`.

### VM dirty-page tuning

For high file I/O workloads (massive builds, `pnpm install`):

```bash
sudo tee /etc/sysctl.d/40-dev-vm.conf >/dev/null <<'EOF'
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF
sudo sysctl --system
```

- `swappiness=10` reduces swap aggression when RAM is plentiful.
- `dirty_ratio=15` / `dirty_background_ratio=5` smooth out dirty-page flushing to avoid sudden I/O stalls during large builds.

### CPU governor

For dev machines doing heavy TypeScript builds, Playwright runs, and `ffmpeg` work, the `performance` governor keeps CPU at max frequency and reduces latency spikes:

```bash
sudo apt install -y linux-tools-common linux-tools-$(uname -r)
sudo cpupower frequency-set -g performance
```

Verify with `cpupower frequency-info`. On laptops where battery life matters, use `schedutil` or `ondemand` instead. This setting does not persist across reboots by default — add it to a systemd service or `/etc/rc.local` if persistence is needed.

### tmpfs for temporary directories

Mounting `/tmp` and `/var/tmp` as tmpfs (RAM-backed) eliminates disk I/O for temporary files — speeds up `ffmpeg` intermediates, browser caches, Playwright temp dirs, and build artifacts that land in temp:

```bash
echo 'tmpfs /tmp tmpfs defaults,noatime,mode=1777 0 0' | sudo tee -a /etc/fstab
echo 'tmpfs /var/tmp tmpfs defaults,noatime,mode=1777 0 0' | sudo tee -a /etc/fstab
mount /tmp && mount /var/tmp
```

Size is dynamically allocated (defaults to half of RAM). Check with `df -h /tmp`. If RAM is limited (< 16 GB), skip `/var/tmp` or set an explicit `size=2G` option.

### Process prioritization for heavy tasks

When running `ffmpeg` (used by `print.pdf.generate`) or Playwright alongside IDE and dev server, lower their CPU/IO priority so the UI stays responsive:

```bash
nice -n 10 ionice -c2 -n7 ffmpeg ...
```

- `nice -n 10` — lower CPU scheduling priority (range -20 to 19, higher = lower priority).
- `ionice -c2 -n7` — best-effort I/O class with lowest priority (0-7, 7 = least urgent).

Use `htop` with `IO_READ_RATE` / `IO_WRITE_RATE` columns to identify disk-bound processes and adjust priority with `F7`/`F8`.

### System maintenance

Keep the system and drivers current — kernel, Mesa, and runtime updates often bring real performance improvements:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
```

Periodically review snap packages and remove unused ones to reduce background service activity:

```bash
snap list
sudo snap remove <unused-package>
```

## Terminal quality-of-life

### Bracketed paste mode

When pasting commands into a terminal, readline may insert `^[[200~` / `~` escape sequences (bracketed paste mode). Disable it globally in `~/.inputrc`:

```text
set enable-bracketed-paste off
```

Restart the terminal or run `exec bash` to apply. This is a per-user setting — no `sudo` needed.

## Cross-platform exception: @warpgogol/forge

`@warpgogol/forge` is published to npm and must remain cross-platform. Its `windows-ai-tooling` skill and any Windows-specific logic in `packages/forge/` must be preserved for consumers running on Windows. The rest of the monorepo assumes Linux.

## Post-migration checklist

When moving the ecosystem to a new machine (e.g. Windows → Ubuntu), `pnpm install` restores JS dependencies but **not** OS-specific native binaries. Run these steps after `pnpm install`:

1. `pnpm exec playwright install chromium` — browser binaries for `print.pdf.generate` and `qa.independent.run` (cached per-OS, not portable across platforms).
2. `pnpm exec site-kernel run compass.audit.validate --strict` — verify the audit ledger has no phantom entries (path mismatch from cross-OS `compass.audit.record` runs).
3. `pnpm --filter <site> run build` — full pipeline smoke test (catches missing native deps like `better-sqlite3`).
4. Apply system-level tuning from the sections above — inotify limits, VM dirty-page tuning, CPU governor, tmpfs, and bracketed paste. These are operator actions and are not automated by the ecosystem.
