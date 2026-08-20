import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveServiceDevUrl, resolveSiteDevUrl } from "./dev-url-resolver.ts";

describe("resolveServiceDevUrl", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "dev-url-"));
    mkdirSync(join(workspaceRoot, "services"), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("returns workersDevUrl when present", () => {
    writeFileSync(
      join(workspaceRoot, "services/registry.yaml"),
      `services:\n  - id: analytics\n    workersDevUrl: https://analytics.dev.example\n    url: https://analytics.example\n`,
    );
    expect(resolveServiceDevUrl("analytics", workspaceRoot)).toBe("https://analytics.dev.example");
  });

  it("falls back to url when workersDevUrl is absent", () => {
    writeFileSync(
      join(workspaceRoot, "services/registry.yaml"),
      `services:\n  - id: analytics\n    url: https://analytics.example\n`,
    );
    expect(resolveServiceDevUrl("analytics", workspaceRoot)).toBe("https://analytics.example");
  });

  it("throws when service is not found", () => {
    writeFileSync(
      join(workspaceRoot, "services/registry.yaml"),
      `services:\n  - id: other\n    url: https://other.example\n`,
    );
    expect(() => resolveServiceDevUrl("missing", workspaceRoot)).toThrow(
      /Service "missing" not found/,
    );
  });

  it("throws when neither workersDevUrl nor url is present", () => {
    writeFileSync(join(workspaceRoot, "services/registry.yaml"), `services:\n  - id: analytics\n`);
    expect(() => resolveServiceDevUrl("analytics", workspaceRoot)).toThrow(
      /has no workersDevUrl or url/,
    );
  });
});

describe("resolveSiteDevUrl", () => {
  let workspaceRoot: string;
  const originalEnv = process.env["WORKSHOP_DEV_DOMAIN"];

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "dev-url-"));
    mkdirSync(join(workspaceRoot, "fleet"), { recursive: true });
    delete process.env["WORKSHOP_DEV_DOMAIN"];
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env["WORKSHOP_DEV_DOMAIN"];
    } else {
      process.env["WORKSHOP_DEV_DOMAIN"] = originalEnv;
    }
  });

  it("constructs dev URL with default domain", () => {
    writeFileSync(
      join(workspaceRoot, "fleet/fleet.sites.yaml"),
      `sites:\n  - site: warpgogol-com\n`,
    );
    expect(resolveSiteDevUrl("warpgogol-com", workspaceRoot)).toBe(
      "https://warpgogol-com.warpgogol.workers.dev",
    );
  });

  it("uses WORKSHOP_DEV_DOMAIN env var when set", () => {
    process.env["WORKSHOP_DEV_DOMAIN"] = "custom.example.com";
    writeFileSync(
      join(workspaceRoot, "fleet/fleet.sites.yaml"),
      `sites:\n  - site: warpgogol-com\n`,
    );
    expect(resolveSiteDevUrl("warpgogol-com", workspaceRoot)).toBe(
      "https://warpgogol-com.custom.example.com",
    );
  });

  it("throws when site is not found", () => {
    writeFileSync(join(workspaceRoot, "fleet/fleet.sites.yaml"), `sites:\n  - site: other-site\n`);
    expect(() => resolveSiteDevUrl("missing", workspaceRoot)).toThrow(/Site "missing" not found/);
  });
});
