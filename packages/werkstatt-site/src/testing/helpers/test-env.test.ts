import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTestEnv, loadServiceDevEnv, getTestEnv } from "./test-env.ts";

describe("loadTestEnv", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "test-env-"));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("parses key=value lines", () => {
    writeFileSync(join(workspaceRoot, ".env.dev"), "FOO=bar\nBAZ=qux\n");
    const env = loadTestEnv(workspaceRoot);
    expect(env["FOO"]).toBe("bar");
    expect(env["BAZ"]).toBe("qux");
  });

  it("ignores comments and empty lines", () => {
    writeFileSync(join(workspaceRoot, ".env.dev"), "# comment\n\nKEY=val\n");
    const env = loadTestEnv(workspaceRoot);
    expect(env).toEqual({ KEY: "val" });
  });

  it("strips double quotes", () => {
    writeFileSync(join(workspaceRoot, ".env.dev"), 'KEY="quoted value"\n');
    expect(loadTestEnv(workspaceRoot)["KEY"]).toBe("quoted value");
  });

  it("strips single quotes", () => {
    writeFileSync(join(workspaceRoot, ".env.dev"), "KEY='quoted value'\n");
    expect(loadTestEnv(workspaceRoot)["KEY"]).toBe("quoted value");
  });

  it("throws when file is missing", () => {
    expect(() => loadTestEnv(workspaceRoot)).toThrow();
  });
});

describe("loadServiceDevEnv", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "test-env-"));
    mkdirSync(join(workspaceRoot, "services", "analytics"), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("loads env from services/<id>/.env.dev", () => {
    writeFileSync(join(workspaceRoot, "services", "analytics", ".env.dev"), "TOKEN=abc\n");
    const env = loadServiceDevEnv("analytics", workspaceRoot);
    expect(env["TOKEN"]).toBe("abc");
  });

  it("throws when service .env.dev is missing", () => {
    expect(() => loadServiceDevEnv("missing", workspaceRoot)).toThrow();
  });
});

describe("getTestEnv", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "test-env-"));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("returns the value for an existing key", () => {
    writeFileSync(join(workspaceRoot, ".env.dev"), "SECRET=hello\n");
    expect(getTestEnv("SECRET", workspaceRoot)).toBe("hello");
  });

  it("throws when key is missing", () => {
    writeFileSync(join(workspaceRoot, ".env.dev"), "OTHER=val\n");
    expect(() => getTestEnv("SECRET", workspaceRoot)).toThrow(
      /Environment variable "SECRET" not found/,
    );
  });
});
