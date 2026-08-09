import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSecrets } from "../secret-scan.ts";

describe("game.secret.scan", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "game-secrets-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("passes with clean source code", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "main.ts"),
      `const config = { apiUrl: "https://api.example.com" };\nexport default config;\n`,
    );

    const result = await scanSecrets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("fails when hardcoded API key is found (GAME-04)", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "config.ts"),
      `const apiKey = "sk_test_1234567890abcdefghijklmnopqrstuvwx";\n`,
    );

    const result = await scanSecrets(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]!.ruleId).toBe("GAME-04");
  });

  it("fails when GitHub token pattern is found (GAME-04)", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "auth.ts"),
      `const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234";\n`,
    );

    const result = await scanSecrets(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations[0]!.ruleId).toBe("GAME-04");
  });

  it("skips comment lines", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "main.ts"),
      `// const apiKey = "sk_test_1234567890abcdefghijklmnopqrstuvwx";\nexport default {};\n`,
    );

    const result = await scanSecrets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("passes with empty src/", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });

    const result = await scanSecrets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
