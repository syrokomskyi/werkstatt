/*
<MODULE_CONTRACT>
<purpose>
Tests for cloudflare.workers.import.lint — CF-IMPORT-01 detects static imports
from cloudflare:workers and does not flag dynamic imports or type-only imports.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { findForbiddenCloudflareWorkersImport } from "../cloudflare-workers-import-lint.ts";

test("flags static named import", () => {
  const source = `import { env } from "cloudflare:workers";`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(true);
});

test("flags static default import", () => {
  const source = `import cloudflareWorkers from "cloudflare:workers";`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(true);
});

test("flags static import with multiple specifiers", () => {
  const source = `import { env, something } from "cloudflare:workers";`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(true);
});

test("does not flag type-only import", () => {
  const source = `import type { env } from "cloudflare:workers";`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(false);
});

test("does not flag dynamic import", () => {
  const source = `const { env } = await import("cloudflare:workers");`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(false);
});

test("does not flag dynamic import in try-catch", () => {
  const source = `
let env: Record<string, string | undefined> = {};
try {
  const mod = await import("cloudflare:workers");
  env = mod.env;
} catch {
  // not in workers runtime
}
`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(false);
});

test("does not flag unrelated imports", () => {
  const source = `import { readFile } from "node:fs/promises";`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(false);
});

test("does not flag string containing cloudflare:workers in a comment", () => {
  const source = `// Use dynamic import("cloudflare:workers") not static`;
  expect(findForbiddenCloudflareWorkersImport(source)).toBe(false);
});
