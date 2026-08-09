import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCloudflarePagesAdapter } from "../cloudflare-pages.ts";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => "ok"),
}));

import { execFileSync } from "node:child_process";

describe("cloudflare-pages deploy adapter", () => {
  let workpiecePath: string;

  beforeEach(async () => {
    workpiecePath = await mkdtemp(join(tmpdir(), "cf-pages-"));
    vi.mocked(execFileSync).mockClear();
  });

  afterEach(async () => {
    await rm(workpiecePath, { recursive: true, force: true });
  });

  it("fails when dist/ does not exist", () => {
    const adapter = createCloudflarePagesAdapter();
    const result = adapter.deploy(workpiecePath, {
      apiToken: "cf_token",
      projectName: "my-game",
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("dist/ directory not found");
  });

  it("fails when API token is not provided", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createCloudflarePagesAdapter();
    const result = adapter.deploy(workpiecePath, {
      apiToken: "",
      projectName: "my-game",
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("API token not provided");
  });

  it("fails when project name is not provided", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createCloudflarePagesAdapter();
    const result = adapter.deploy(workpiecePath, {
      apiToken: "cf_token",
      projectName: "",
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("project name not provided");
  });

  it("succeeds and calls wrangler pages deploy with correct args", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createCloudflarePagesAdapter();
    const result = adapter.deploy(workpiecePath, {
      apiToken: "cf_token",
      projectName: "my-game",
      branch: "main",
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://my-game.pages.dev");
    expect(execFileSync).toHaveBeenCalled();
    const lastCall = vi.mocked(execFileSync).mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("npx");
    const args = lastCall?.[1] as string[];
    expect(args).toContain("wrangler");
    expect(args).toContain("pages");
    expect(args).toContain("deploy");
    expect(args).toContain("--project-name");
    expect(args).toContain("my-game");
    expect(args).toContain("--branch");
    expect(args).toContain("main");
  });

  it("passes credentials via env, not args", async () => {
    await mkdir(join(workpiecePath, "dist"), { recursive: true });
    const adapter = createCloudflarePagesAdapter();
    adapter.deploy(workpiecePath, {
      apiToken: "cf_secret_token",
      accountId: "cf_account_123",
      projectName: "my-game",
    });

    const lastCall = vi.mocked(execFileSync).mock.calls.at(-1) as unknown as any[];
    const options = lastCall[2] as { env: Record<string, string> } | undefined;
    expect(options?.env.CLOUDFLARE_API_TOKEN).toBe("cf_secret_token");
    expect(options?.env.CLOUDFLARE_ACCOUNT_ID).toBe("cf_account_123");
    // Token must NOT appear in command args
    const args = lastCall[1] as string[];
    expect(args.some((a: string) => a.includes("cf_secret_token"))).toBe(false);
  });
});
