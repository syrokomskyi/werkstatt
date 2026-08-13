/*
<MODULE_CONTRACT>
<purpose>Loads dev environment variables from .env.dev files for integration, E2E, and smoke tests. Reuses existing dev credentials (RFC-0806) — no separate .env.test file.</purpose>
<non-goals>
  <item>Does not load production .env files — dev env only.</item>
  <item>Does not validate env var presence — callers check for required keys.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0823: initial implementation of test env loader for the testing pyramid helpers.</item>
  <item>RFC-0826: changed from .env.test to .env.dev reuse convention; added loadServiceDevEnv.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Parses a .env file into a key-value record.
 * Supports `KEY=VALUE` lines, ignores comments (`#`) and empty lines.
 * Handles quoted values (`KEY="value"` and `KEY='value'`).
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
}

/**
 * Loads test environment variables from `.env.test` in the package root.
 *
 * @returns A record of key-value pairs from the .env.test file.
 * @throws if `.env.test` does not exist or a variable is missing.
 */
export function loadTestEnv(workspaceRoot: string): Record<string, string> {
  const envPath = resolve(workspaceRoot, ".env.test");
  const raw = readFileSync(envPath, "utf-8");
  return parseEnvFile(raw);
}

/**
 * Loads test environment variables and returns the value for a specific key.
 *
 * @throws if `.env.test` does not exist or the key is missing.
 */
export function getTestEnv(key: string, workspaceRoot: string): string {
  const env = loadTestEnv(workspaceRoot);
  const value = env[key];
  if (value === undefined) {
    throw new Error(`[test-env] Environment variable "${key}" not found in .env.test`);
  }
  return value;
}
