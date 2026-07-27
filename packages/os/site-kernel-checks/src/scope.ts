/*
<MODULE_CONTRACT>
<purpose>RFC-0139: the optional --scope-files filter shared by the deterministic content
validators the amend gates dispatch. When the flag is present, a validator evaluates only
the listed repo-relative files; when absent it behaves exactly as before (whole-app), so
greenfield and CI are unchanged.</purpose>
<non-goals>
  <item>Do not compute the batch delta — that is amend.delta.files in site-kernel-onboarding.</item>
  <item>Do not change any validator's rules; this is only an input filter.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0139: initial creation.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandInput } from "@gogol/site-kernel";

/** Parse `--scope-files a,b,c` into a Set of repo-relative paths, or null when not supplied. */
export function readScopeFiles(input: KernelCommandInput): Set<string> | null {
  const direct = input.flags["scope-files"];
  let raw: string | undefined;
  if (typeof direct === "string") raw = direct;
  else {
    const prefix = "--scope-files=";
    const arg = input.args.find((entry) => entry.startsWith(prefix));
    if (arg) raw = arg.slice(prefix.length);
  }
  if (!raw) return null;
  const set = new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().replace(/\\/g, "/"))
      .filter(Boolean),
  );
  return set.size > 0 ? set : null;
}

/** True when `allow` is active and `relPath` is not in it — the file should be skipped. */
export function outOfScope(allow: Set<string> | null, relPath: string): boolean {
  return allow !== null && !allow.has(relPath.replace(/\\/g, "/"));
}
