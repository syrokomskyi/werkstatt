import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateGitignore } from "../checks/gitignore-validate.ts";

describe("validateGitignore", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-gitignore-test-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when .gitignore contains .godot/", async () => {
    writeFileSync(join(projectRoot, ".gitignore"), ".godot/\nbin/\nobj/\n");

    const result = await validateGitignore(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("passes when .gitignore contains .godot without trailing slash", async () => {
    writeFileSync(join(projectRoot, ".gitignore"), ".godot\n");

    const result = await validateGitignore(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when .gitignore is missing", async () => {
    const result = await validateGitignore(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
  });

  it("fails when .gitignore does not contain .godot/", async () => {
    writeFileSync(join(projectRoot, ".gitignore"), "bin/\nobj/\n");

    const result = await validateGitignore(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
  });
});
