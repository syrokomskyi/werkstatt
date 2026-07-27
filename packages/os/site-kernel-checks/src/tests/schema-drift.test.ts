import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSchemaDriftValidate } from "../schema-drift.ts";
import type { KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for schema.drift.validate — verifies that proxy files
    (pure re-exports) are skipped and non-proxy Zod schema definitions are
    flagged as violations.
  </purpose>
</MODULE_CONTRACT>
*/

const PROXY_FILE = `export * from "@warpgogol/share/schemas/page";
export { pageSchema } from "@warpgogol/share/schemas/page";
`;

const ZOD_DEFINITION_FILE = `import { z } from "zod";
export const mySchema = z.object({
  name: z.string(),
  value: z.number(),
});
`;

const PLAIN_INTERFACE_FILE = `export interface MyData {
  name: string;
  value: number;
}
`;

describe("schema.drift.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let schemasDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "schema-drift-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    schemasDir = join(appDir, "src", "content", "schemas");
    await mkdir(schemasDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when schemas dir contains only proxy files", async () => {
    await writeFile(join(schemasDir, "page.ts"), PROXY_FILE);
    await writeFile(join(schemasDir, "block.ts"), PROXY_FILE);

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runSchemaDriftValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("flags non-proxy Zod schema definitions", async () => {
    await writeFile(join(schemasDir, "local.ts"), ZOD_DEFINITION_FILE);

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runSchemaDriftValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(1);
  });

  it("passes for plain TypeScript interfaces (no Zod)", async () => {
    await writeFile(join(schemasDir, "types.ts"), PLAIN_INTERFACE_FILE);

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runSchemaDriftValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("passes when schemas dir does not exist", async () => {
    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runSchemaDriftValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("handles nested directories in schemas/", async () => {
    await mkdir(join(schemasDir, "sub"), { recursive: true });
    await writeFile(join(schemasDir, "sub", "local.ts"), ZOD_DEFINITION_FILE);
    await writeFile(join(schemasDir, "proxy.ts"), PROXY_FILE);

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runSchemaDriftValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(1);
  });
});
