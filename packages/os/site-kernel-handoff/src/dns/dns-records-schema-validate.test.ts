/*
<MODULE_CONTRACT>
  <purpose>RFC-0753: unit tests for dns.records.schema.validate command handler.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0753: initial schema validate tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runDnsRecordsSchemaValidate } from "./dns-records-schema-validate.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-dns-schema-validate-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeInput(flags: Record<string, unknown>): {
  argv: string[];
  flags: Record<string, unknown>;
} {
  return { argv: [], flags };
}

test("schema.validate: valid declaration file passes", async () => {
  mkdirSync(join(tmpDir, "systems", "test-system"), { recursive: true });
  writeFileSync(
    join(tmpDir, "systems", "test-system", "dns-records.yaml"),
    `kind: dns-records
schemaVersion: 1
zone: example.com
updatedAt: "2026-01-01T00:00:00.000Z"
records:
  - name: example.com
    type: A
    content: 192.0.2.1
    proxied: true
`,
  );

  const result = await runDnsRecordsSchemaValidate(
    makeInput({ system: "test-system" }) as any,
    { workspaceRoot: tmpDir } as any,
  );

  expect(result.data!.state).toBe("valid");
  expect(result.data!.files).toHaveLength(1);
  expect(result.data!.files[0].valid).toBe(true);
  expect(result.exitCode).toBeUndefined();
});

test("schema.validate: invalid record type fails", async () => {
  mkdirSync(join(tmpDir, "systems", "test-system"), { recursive: true });
  writeFileSync(
    join(tmpDir, "systems", "test-system", "dns-records.yaml"),
    `kind: dns-records
schemaVersion: 1
zone: example.com
updatedAt: "2026-01-01T00:00:00.000Z"
records:
  - name: example.com
    type: INVALID
    content: 192.0.2.1
`,
  );

  const result = await runDnsRecordsSchemaValidate(
    makeInput({ system: "test-system" }) as any,
    { workspaceRoot: tmpDir } as any,
  );

  expect(result.data!.state).toBe("invalid");
  expect(result.data!.files[0].valid).toBe(false);
  expect(result.data!.files[0].errors).not.toBeNull();
  expect(result.exitCode).toBe(1);
});

test("schema.validate: missing file is skipped (not an error)", async () => {
  const result = await runDnsRecordsSchemaValidate(
    makeInput({ system: "nonexistent" }) as any,
    { workspaceRoot: tmpDir } as any,
  );

  expect(result.data!.state).toBe("valid");
  expect(result.data!.files).toHaveLength(0);
});

test("schema.validate: no --system scans all systems", async () => {
  mkdirSync(join(tmpDir, "systems", "sys-a"), { recursive: true });
  writeFileSync(
    join(tmpDir, "systems", "sys-a", "dns-records.yaml"),
    `kind: dns-records
schemaVersion: 1
zone: a.example.com
updatedAt: "2026-01-01T00:00:00.000Z"
records: []
`,
  );
  mkdirSync(join(tmpDir, "systems", "sys-b"), { recursive: true });
  writeFileSync(
    join(tmpDir, "systems", "sys-b", "dns-records.yaml"),
    `kind: dns-records
schemaVersion: 1
zone: b.example.com
updatedAt: "2026-01-01T00:00:00.000Z"
records: []
`,
  );

  const result = await runDnsRecordsSchemaValidate(
    makeInput({}) as any,
    { workspaceRoot: tmpDir } as any,
  );

  expect(result.data!.state).toBe("valid");
  expect(result.data!.files).toHaveLength(2);
});

test("schema.validate: invalid schemaVersion fails", async () => {
  mkdirSync(join(tmpDir, "systems", "test-system"), { recursive: true });
  writeFileSync(
    join(tmpDir, "systems", "test-system", "dns-records.yaml"),
    `kind: dns-records
schemaVersion: 2
zone: example.com
updatedAt: "2026-01-01T00:00:00.000Z"
records: []
`,
  );

  const result = await runDnsRecordsSchemaValidate(
    makeInput({ system: "test-system" }) as any,
    { workspaceRoot: tmpDir } as any,
  );

  expect(result.data!.state).toBe("invalid");
  expect(result.exitCode).toBe(1);
});
