import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSecrets } from "../checks/secret-scan.ts";

describe("scanSecrets", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-secret-test-"));
    mkdirSync(join(projectRoot, "Scripts"), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when no secrets are present", async () => {
    writeFileSync(join(projectRoot, "Scripts", "Main.cs"), "public class Main {}\n");

    const result = await scanSecrets(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("detects hardcoded API key", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Bad.cs"),
      'public class Bad { string key = "AKIAIOSFODNN7EXAMPLE1234"; }\n',
    );

    const result = await scanSecrets(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations.length).toBeGreaterThanOrEqual(1);
  });

  it("detects GitHub personal access token", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Bad.cs"),
      'public class Bad { string t = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234"; }\n',
    );

    const result = await scanSecrets(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations.length).toBeGreaterThanOrEqual(1);
  });

  it("skips comments", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Main.cs"),
      '// string key = "api_key_abcdef1234567890abcdef"\n',
    );

    const result = await scanSecrets(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("skips .g.cs generated files", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Generated.g.cs"),
      'public class Gen { string key = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234"; }\n',
    );

    const result = await scanSecrets(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("skips bin/ and obj/ directories", async () => {
    mkdirSync(join(projectRoot, "bin"), { recursive: true });
    writeFileSync(
      join(projectRoot, "bin", "Bad.cs"),
      'public class Bad { string t = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234"; }\n',
    );

    const result = await scanSecrets(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
