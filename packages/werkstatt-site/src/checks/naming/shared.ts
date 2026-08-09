/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/naming/shared.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of naming.ts's shared collection helpers.</item>
</CHANGE_SUMMARY>
*/

import { basename } from "node:path";
import { collectFiles } from "@warpgogol/share/fs";

export async function collectAllAstroFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".astro"], ignore: () => false });
}

export async function walkForExtension(
  dir: string,
  matchFn: (name: string) => boolean,
  results: string[],
  skipDirs?: Set<string>,
): Promise<void> {
  const found = await collectFiles(dir, {
    ignore: (name) => name.startsWith(".") || (skipDirs?.has(name) ?? false),
  });
  results.push(...found.filter((full) => matchFn(basename(full))));
}

export async function walkFiles(
  dir: string,
  results: string[],
  skipDirs?: Set<string>,
): Promise<void> {
  const found = await collectFiles(dir, {
    ignore: (name) => name.startsWith(".") || (skipDirs?.has(name) ?? false),
  });
  results.push(...found);
}
