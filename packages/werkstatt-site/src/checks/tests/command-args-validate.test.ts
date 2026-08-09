import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanFileForArgsViolations,
  hasEmptyFlags,
  extractNamedFlagReads,
} from "../command-args-validate.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0610: fixture tests for command.args.validate — ARG-COMPLIANCE-01/02/03,
    comment/string exclusion, and clean-pass scenarios.
  </purpose>
</MODULE_CONTRACT>
*/

async function setupFixtureFile(
  source: string,
  dir = "packages/os/site-kernel-checks/src",
): Promise<{ root: string; relFile: string }> {
  const root = await mkdtemp(join(tmpdir(), "cmd-args-validate-"));
  const relFile = join(dir, "fixture-handler.ts").split("\\").join("/");
  await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, relFile), source, "utf8");
  return { root, relFile };
}

describe("command.args.validate (RFC-0610)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cmd-args-validate-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // ARG-COMPLIANCE-01: handler reads input.args
  // -------------------------------------------------------------------------

  it("ARG-COMPLIANCE-01: detects input.args reference", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        const id = input.args[0];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("ARG-COMPLIANCE-01");
    await rm(root, { recursive: true, force: true });
  });

  it("ARG-COMPLIANCE-01 clean: no violation when only input.flags is used", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        const id = input.flags["id"];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // ARG-COMPLIANCE-03: dual-path fallback
  // -------------------------------------------------------------------------

  it("ARG-COMPLIANCE-03: detects ?? input.args[0] fallback", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        const id = input.flags["id"] ?? input.args[0];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("ARG-COMPLIANCE-03");
    await rm(root, { recursive: true, force: true });
  });

  it("ARG-COMPLIANCE-03: detects || input.args[0] fallback", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        const id = input.flags["id"] || input.args[0];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("ARG-COMPLIANCE-03");
    await rm(root, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Comment and string-literal exclusion
  // -------------------------------------------------------------------------

  it("comment exclusion: // input.args in comment is not flagged", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        // const id = input.args[0];
        const id = input.flags["id"];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it("comment exclusion: block comment with input.args is not flagged", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        /* const id = input.args[0]; */
        const id = input.flags["id"];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('string-literal exclusion: "input.args" in string is not flagged', async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        const msg = "input.args is removed";
        const id = input.flags["id"];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // ARG-COMPLIANCE-02: empty flags with named flag read
  // -------------------------------------------------------------------------

  it("ARG-COMPLIANCE-02: hasEmptyFlags returns true for undefined", () => {
    expect(hasEmptyFlags(undefined)).toBe(true);
  });

  it("ARG-COMPLIANCE-02: hasEmptyFlags returns true for empty object", () => {
    expect(hasEmptyFlags({})).toBe(true);
  });

  it("ARG-COMPLIANCE-02: hasEmptyFlags returns false for non-empty flags", () => {
    expect(hasEmptyFlags({ id: { kind: "string", description: "x" } })).toBe(false);
  });

  it("ARG-COMPLIANCE-02: extractNamedFlagReads detects string-literal flag access", () => {
    const body = `{ const id = input.flags["id"]; const app = input.flags["app"]; }`;
    const reads = extractNamedFlagReads(body);
    expect(reads.has("id")).toBe(true);
    expect(reads.has("app")).toBe(true);
    expect(reads.size).toBe(2);
  });

  it("ARG-COMPLIANCE-02 clean: dynamic flag access is not detected", () => {
    const body = `{ const key = getKey(); const val = input.flags[key]; }`;
    const reads = extractNamedFlagReads(body);
    expect(reads.size).toBe(0);
  });

  it("ARG-COMPLIANCE-02 clean: no flag reads in handler without flags", () => {
    const body = `{ return { exitCode: 0 }; }`;
    const reads = extractNamedFlagReads(body);
    expect(reads.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Clean-pass: all handlers use declared flags
  // -------------------------------------------------------------------------

  it("clean-pass: handler with only input.flags reads and no input.args produces no violations", async () => {
    const { root, relFile } = await setupFixtureFile(
      `export async function runFixture(input, context) {
        const id = input.flags["id"];
        const app = input.flags["app"];
        return { exitCode: 0 };
      }`,
    );
    const violations = scanFileForArgsViolations(relFile, root);
    expect(violations).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});
