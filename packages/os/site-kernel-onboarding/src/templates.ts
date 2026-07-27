/*
<MODULE_CONTRACT>
<purpose>Shared template helpers for @gogol/site-kernel-onboarding —
readTemplate, readRuntimeTemplate, and applyTokens. Used by scaffold.ts,
config-regenerate.ts, and mission-materialize.ts (via workspace dependency).</purpose>
<non-goals>
  <item>Does not apply business logic — only file reading and token substitution.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0389: Extracted from scaffold.ts and config-regenerate.ts to unify duplicates.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = join(__dirname, "..", "src", "templates");
export const RUNTIME_TEMPLATES_DIR = join(TEMPLATES_DIR, "runtime");

export function readTemplate(filename: string): string {
  return readFileSync(join(TEMPLATES_DIR, filename), "utf8");
}

export function readRuntimeTemplate(filename: string): string {
  return readFileSync(join(RUNTIME_TEMPLATES_DIR, filename), "utf8");
}

export function applyTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] ?? `{{${key}}}`);
}
