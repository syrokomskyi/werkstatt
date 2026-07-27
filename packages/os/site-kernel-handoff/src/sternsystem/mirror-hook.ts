/*
<MODULE_CONTRACT>
<purpose>Ensure a bare repo has a post-receive hook that auto-pushes to the mirror remote.
Installs the hook if missing, updates it if stale. Idempotent.</purpose>
<non-goals>
  <item>Do not push to the mirror — that is the hook's job at receive time.</item>
  <item>Do not remove or modify hooks that are not the mirror auto-push hook.</item>
</non-goals>
</MODULE_CONTRACT>
*/

import { writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";

const HOOK_MARKER = "# wgogol-mirror-auto-push";
const HOOK_BRANCH = "master";

const HOOK_CONTENT = `#!/bin/sh
${HOOK_MARKER}
# Auto-push to mirror on any receive (RFC-0480 mirror sync automation).
# Fires after mission.reconcile pushes to this bare repo, propagating to GitHub mirror.
# Managed by sternsystem.sync / sternsystem.register — do not edit manually.

MIRROR_REMOTE="mirror"
BRANCH="${HOOK_BRANCH}"

while read oldrev newrev refname; do
  branch=$(echo "$refname" | sed 's|refs/heads/||')
  if [ "$branch" = "$BRANCH" ]; then
    echo "  [post-receive] pushing $branch to $MIRROR_REMOTE…" >&2
    git push "$MIRROR_REMOTE" "$branch" >&2 2>&1 || echo "  [post-receive] mirror push failed (non-fatal)" >&2
  fi
done
`;

export interface MirrorHookResult {
  installed: boolean;
  updated: boolean;
  alreadyPresent: boolean;
  hookPath: string;
}

export function ensureMirrorHook(bareRepoPath: string): MirrorHookResult {
  const hooksDir = path.join(bareRepoPath, "hooks");
  const hookPath = path.join(hooksDir, "post-receive");

  if (!existsSync(hooksDir)) {
    return {
      installed: false,
      updated: false,
      alreadyPresent: false,
      hookPath,
    };
  }

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf8");
    if (existing.includes(HOOK_MARKER)) {
      if (existing === HOOK_CONTENT) {
        return { installed: false, updated: false, alreadyPresent: true, hookPath };
      }
      writeFileSync(hookPath, HOOK_CONTENT, "utf8");
      chmodSync(hookPath, 0o755);
      return { installed: false, updated: true, alreadyPresent: false, hookPath };
    }
    return { installed: false, updated: false, alreadyPresent: false, hookPath };
  }

  writeFileSync(hookPath, HOOK_CONTENT, "utf8");
  chmodSync(hookPath, 0o755);
  return { installed: true, updated: false, alreadyPresent: false, hookPath };
}
