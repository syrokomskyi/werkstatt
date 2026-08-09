import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateBundle } from "../bundle-validate.ts";

describe("game.bundle.validate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "game-bundle-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("passes when bundle is under default budget", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "dist", "game.js"), "console.log('hello');");
    await writeFile(
      join(projectRoot, "phaser.config.ts"),
      `export default { bundleBudget: 5242880 };`,
    );

    const result = await validateBundle(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.bundleBytes).toBeLessThan(result.data?.budgetBytes ?? 0);
  });

  it("fails when bundle exceeds budget (GAME-03)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    // Write content with high entropy so gzip can't compress it below the budget
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let largeContent = "";
    for (let i = 0; i < 1000; i++) {
      largeContent += chars[Math.floor(Math.random() * chars.length)];
    }
    await writeFile(join(projectRoot, "dist", "game.js"), largeContent);
    await writeFile(join(projectRoot, "phaser.config.ts"), `export default { bundleBudget: 100 };`);

    const result = await validateBundle(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]!.ruleId).toBe("GAME-03");
    expect(result.data?.violations[0]!.bundleBytes).toBeGreaterThan(0);
    expect(result.data?.violations[0]!.budgetBytes).toBe(100);
  });

  it("uses default 5 MB budget when phaser.config.ts has no bundleBudget", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "dist", "game.js"), "console.log('hello');");
    await writeFile(join(projectRoot, "phaser.config.ts"), `export default { scenes: [] };`);

    const result = await validateBundle(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.budgetBytes).toBe(5 * 1024 * 1024);
  });

  it("uses default budget when phaser.config.ts is missing", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "dist", "game.js"), "console.log('hello');");

    const result = await validateBundle(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.budgetBytes).toBe(5 * 1024 * 1024);
  });

  it("passes with empty dist/ (zero bundle)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });

    const result = await validateBundle(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.bundleBytes).toBe(0);
  });
});
