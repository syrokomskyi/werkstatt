/*
  RFC-0751: Unit tests for service.naming.validate and service.registry.validate.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runServiceNamingValidate } from "../services/service-naming-validate.ts";
import { runServiceRegistryValidate } from "../services/service-registry-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

function makeInput(): KernelCommandInput {
  return { flags: {}, argv: [] };
}

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    logger: { info: () => {}, warn: () => {}, success: () => {}, error: () => {} },
  } as unknown as KernelRuntimeContext;
}

function writeRegistry(dir: string, services: Array<Record<string, unknown>>): void {
  const yaml = [
    "schemaVersion: 1.0.0",
    "services:",
    ...services.map(
      (s) =>
        `  - id: ${s.id}\n    kind: ${s.kind}\n    workerName: ${s.workerName}\n    hostedBy: studio\n    url: ${s.url}\n    publicEndpoints: ${s.publicEndpoints ?? false}\n    subdomains: []\n    lastDeployed:\n      at: null\n      state: null\n      operationId: null`,
    ),
  ].join("\n");
  mkdirSync(join(dir, "services"), { recursive: true });
  writeFileSync(join(dir, "services", "registry.yaml"), yaml + "\n");
}

function writeServiceConfig(dir: string, id: string, opts: { kind?: string } = {}): void {
  const yaml = [
    `id: ${id}`,
    `kind: ${opts.kind ?? "proxy-worker"}`,
    "entry: src/worker.ts",
    "publicEndpoints: true",
  ].join("\n");
  const serviceDir = join(dir, "services", id);
  mkdirSync(serviceDir, { recursive: true });
  writeFileSync(join(serviceDir, "service.config.yaml"), yaml + "\n");
}

function writeWrangler(dir: string, id: string, name: string): void {
  const serviceDir = join(dir, "services", id);
  mkdirSync(serviceDir, { recursive: true });
  writeFileSync(
    join(serviceDir, "wrangler.jsonc"),
    JSON.stringify({ name, main: "src/worker.ts" }, null, 2) + "\n",
  );
}

function writePackageJson(dir: string, id: string, name: string): void {
  const serviceDir = join(dir, "services", id);
  mkdirSync(serviceDir, { recursive: true });
  writeFileSync(
    join(serviceDir, "package.json"),
    JSON.stringify({ name, version: "0.0.0", private: true }, null, 2) + "\n",
  );
}

describe("service.naming.validate (RFC-0751)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(process.cwd(), "tmp-svc-naming-"));
    mkdirSync(join(tmpDir, "systems"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes when all names match", async () => {
    writeRegistry(tmpDir, [
      {
        id: "matomo-proxy",
        kind: "proxy-worker",
        workerName: "matomo-proxy",
        url: "https://matomo-proxy.example.workers.dev",
        publicEndpoints: true,
      },
    ]);
    writeServiceConfig(tmpDir, "matomo-proxy");
    writeWrangler(tmpDir, "matomo-proxy", "matomo-proxy");
    writePackageJson(tmpDir, "matomo-proxy", "matomo-proxy");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("pass");
  });

  it("fails when workerName does not match id", async () => {
    writeRegistry(tmpDir, [
      {
        id: "my-service",
        kind: "proxy-worker",
        workerName: "wrong-name",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "my-service");
    writeWrangler(tmpDir, "my-service", "my-service");
    writePackageJson(tmpDir, "my-service", "my-service");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-NAME-01")).toBe(true);
  });

  it("fails when wrangler name does not match id", async () => {
    writeRegistry(tmpDir, [
      {
        id: "my-service",
        kind: "proxy-worker",
        workerName: "my-service",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "my-service");
    writeWrangler(tmpDir, "my-service", "wrong-wrangler-name");
    writePackageJson(tmpDir, "my-service", "my-service");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-NAME-02")).toBe(true);
  });

  it("fails when service.config.yaml id does not match", async () => {
    writeRegistry(tmpDir, [
      {
        id: "my-service",
        kind: "proxy-worker",
        workerName: "my-service",
        url: "https://example.workers.dev",
      },
    ]);
    const serviceDir = join(tmpDir, "services", "my-service");
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(join(serviceDir, "service.config.yaml"), "id: wrong-id\nkind: proxy-worker\n");
    writeWrangler(tmpDir, "my-service", "my-service");
    writePackageJson(tmpDir, "my-service", "my-service");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-NAME-03")).toBe(true);
  });

  it("passes with scoped package.json name @warpgogol/<id>", async () => {
    writeRegistry(tmpDir, [
      {
        id: "rate-fetcher",
        kind: "scheduled-worker",
        workerName: "rate-fetcher",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "rate-fetcher", { kind: "scheduled-worker" });
    writeWrangler(tmpDir, "rate-fetcher", "rate-fetcher");
    writePackageJson(tmpDir, "rate-fetcher", "@warpgogol/rate-fetcher");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
  });

  it("fails when id ends with -worker suffix (SVC-NAME-06, RFC-0805)", async () => {
    writeRegistry(tmpDir, [
      {
        id: "rate-fetcher-worker",
        kind: "scheduled-worker",
        workerName: "rate-fetcher-worker",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "rate-fetcher-worker", { kind: "scheduled-worker" });
    writeWrangler(tmpDir, "rate-fetcher-worker", "rate-fetcher-worker");
    writePackageJson(tmpDir, "rate-fetcher-worker", "@warpgogol/rate-fetcher-worker");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-NAME-06")).toBe(true);
  });

  it("passes when id does not end with -worker suffix", async () => {
    writeRegistry(tmpDir, [
      {
        id: "lagebild-sync",
        kind: "scheduled-worker",
        workerName: "lagebild-sync",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "lagebild-sync", { kind: "scheduled-worker" });
    writeWrangler(tmpDir, "lagebild-sync", "lagebild-sync");
    writePackageJson(tmpDir, "lagebild-sync", "@warpgogol/lagebild-sync");

    const result = await runServiceNamingValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
  });
});

describe("service.registry.validate (RFC-0751)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(process.cwd(), "tmp-svc-reg-"));
    mkdirSync(join(tmpDir, "systems"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes with valid registry and matching service.config.yaml", async () => {
    writeRegistry(tmpDir, [
      {
        id: "matomo-proxy",
        kind: "proxy-worker",
        workerName: "matomo-proxy",
        url: "https://example.workers.dev",
        publicEndpoints: true,
      },
    ]);
    writeServiceConfig(tmpDir, "matomo-proxy", { kind: "proxy-worker" });
    writeWrangler(tmpDir, "matomo-proxy", "matomo-proxy");

    const result = await runServiceRegistryValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("pass");
  });

  it("fails when services key is missing", async () => {
    writeFileSync(join(tmpDir, "systems", "registry.yaml"), "schemaVersion: 1.0.0\nsystems: []\n");

    const result = await runServiceRegistryValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-REG-02")).toBe(true);
  });

  it("fails on duplicate service id", async () => {
    writeRegistry(tmpDir, [
      {
        id: "dup-service",
        kind: "proxy-worker",
        workerName: "dup-service",
        url: "https://a.workers.dev",
      },
      {
        id: "dup-service",
        kind: "proxy-worker",
        workerName: "dup-service",
        url: "https://b.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "dup-service");
    writeWrangler(tmpDir, "dup-service", "dup-service");

    const result = await runServiceRegistryValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-REG-04")).toBe(true);
  });

  it("fails when workerName does not match id", async () => {
    writeRegistry(tmpDir, [
      {
        id: "my-service",
        kind: "proxy-worker",
        workerName: "mismatched",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "my-service");
    writeWrangler(tmpDir, "my-service", "my-service");

    const result = await runServiceRegistryValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-REG-05")).toBe(true);
  });

  it("fails when service.config.yaml kind mismatch", async () => {
    writeRegistry(tmpDir, [
      {
        id: "my-service",
        kind: "proxy-worker",
        workerName: "my-service",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "my-service", { kind: "scheduled-worker" });
    writeWrangler(tmpDir, "my-service", "my-service");

    const result = await runServiceRegistryValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-REG-06")).toBe(true);
  });

  it("fails when wrangler.jsonc is missing", async () => {
    writeRegistry(tmpDir, [
      {
        id: "no-wrangler",
        kind: "proxy-worker",
        workerName: "no-wrangler",
        url: "https://example.workers.dev",
      },
    ]);
    writeServiceConfig(tmpDir, "no-wrangler");
    // No wrangler.jsonc

    const result = await runServiceRegistryValidate(makeInput(), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "SVC-REG-07")).toBe(true);
  });
});
