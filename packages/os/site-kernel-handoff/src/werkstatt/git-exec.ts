/*
<MODULE_CONTRACT>
<purpose>Shared git command executor for werkstatt and bordbuch modules. Extracted from bordbuch-io.ts (RFC-0580) to avoid cross-module dependency.</purpose>
<non-goals>
  <item>Does not define git workflow logic — that lives in callers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0580: extract gitExec from bordbuch-io.ts into shared utility with allowNonZero option.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";

export function gitExec(
  cwd: string,
  args: string,
  options?: { allowNonZero?: boolean },
): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
  } catch (err) {
    if (options?.allowNonZero) {
      return "";
    }
    throw err;
  }
}
