import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGitHubPagesAdapter } from "../github-pages.ts";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => "ok"),
}));

import { execFileSync } from "node:child_process";

describe("github-pages deploy adapter", () => {
  let workpiecePath: string;

  beforeEach(async () => {
    workpiecePath = await mkdtemp(join(tmpdir(), "gh-pages-"));
    vi.mocked(execFileSync).mockClear();
  });

  afterEach(async () => {
    await rm(workpiecePath, { recursive: true, force: true });
  });

  it("fails when dist/ does not exist", () => {
    const adapter = createGitHubPagesAdapter();
    const result = adapter.deploy(workpiecePath, { token: "ghp_test" });

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("dist/ directory not found");
  });

  it("fails when token is not provided", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createGitHubPagesAdapter();
    const result = adapter.deploy(workpiecePath, { token: "" });

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("GitHub token not provided");
  });

  it("succeeds and calls gh-pages with correct args", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createGitHubPagesAdapter();
    const result = adapter.deploy(workpiecePath, {
      token: "ghp_testtoken",
      repo: "user/repo",
    });

    expect(result.success).toBe(true);
    expect(result.url).toContain("github.io");
    expect(execFileSync).toHaveBeenCalled();
    const lastCall = vi.mocked(execFileSync).mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("npx");
    const args = lastCall?.[1] as string[];
    expect(args).toContain("gh-pages");
    expect(args).toContain("-d");
    expect(args).toContain("dist");
  });

  it("passes branch and repo URL when configured", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createGitHubPagesAdapter();
    adapter.deploy(workpiecePath, {
      token: "ghp_testtoken",
      repo: "user/repo",
      branch: "main",
    });

    const lastCall = vi.mocked(execFileSync).mock.calls.at(-1);
    const args = lastCall?.[1] as string[];
    expect(args).toContain("-b");
    expect(args).toContain("main");
  });
});
