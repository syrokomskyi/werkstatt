/*
<MODULE_CONTRACT>
<purpose>RFC-0825: Shared smoke test runner — fetches endpoints and verifies
responses (status code, body contains, timeout). Reads declarative YAML
definitions and returns a structured SmokeRunResult.</purpose>
<keywords>smoke, testing, runner, post-deploy, verification</keywords>
<responsibilities>
  <item>Loads smoke endpoint definitions from YAML files.</item>
  <item>Fetches each endpoint with timeout via AbortController.</item>
  <item>Checks status code and optional body-contains assertion.</item>
  <item>Returns structured SmokeRunResult with per-endpoint check results.</item>
  <item>Provides runSmokeChecksOrSkip variant for pipeline integration (missing YAML = skipped, not error).</item>
</responsibilities>
<non-goals>
  <item>Do not register kernel commands — that lives in testing/module.ts.</item>
  <item>Do not resolve service/site URLs from registry — callers provide the URL or resolve it externally.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0825: initial smoke runner implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  SmokeEndpoint,
  SmokeRunInput,
  SmokeRunResult,
  SmokeCheckResult,
} from "@warpgogol/werkstatt/testing/smoke";

export interface ServiceSmokeYaml {
  services: Record<string, { endpoints: SmokeEndpoint[] }>;
}

export interface SiteSmokeYaml {
  sites: Record<string, { paths: SmokeEndpoint[] }>;
}

export class SmokeConfigNotFoundError extends Error {
  constructor(path: string) {
    super(`smoke configuration file not found at ${path}`);
    this.name = "SmokeConfigNotFoundError";
  }
}

export class SmokeEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`no smoke configuration found for ${id}`);
    this.name = "SmokeEntryNotFoundError";
  }
}

function serializeBody(
  body: Record<string, unknown>,
  contentType: string,
): string {
  if (contentType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      params.append(key, String(value));
    }
    return params.toString();
  }
  return JSON.stringify(body);
}

async function checkEndpoint(
  baseUrl: string,
  endpoint: SmokeEndpoint,
): Promise<SmokeCheckResult> {
  const method = endpoint.method ?? "GET";
  const contentType = endpoint.contentType ?? "application/json";
  const url = baseUrl.replace(/\/$/, "") + endpoint.path;
  const start = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), endpoint.timeoutMs);

  try {
    const init: RequestInit = {
      method,
      redirect: "follow",
      signal: controller.signal,
    };

    if (endpoint.body && (method === "POST" || method === "HEAD")) {
      init.headers = { "Content-Type": contentType };
      init.body = serializeBody(endpoint.body, contentType);
    }

    const response = await fetch(url, init);
    const durationMs = Date.now() - start;

    if (response.status !== endpoint.expectStatus) {
      return {
        path: endpoint.path,
        method,
        status: response.status,
        passed: false,
        error: `expected ${endpoint.expectStatus}, got ${response.status}`,
        durationMs,
      };
    }

    if (endpoint.expectBodyContains) {
      const text = await response.text();
      if (!text.includes(endpoint.expectBodyContains)) {
        return {
          path: endpoint.path,
          method,
          status: response.status,
          passed: false,
          error: `expected body to contain '${endpoint.expectBodyContains}' but got '${text.slice(0, 200)}'`,
          durationMs,
        };
      }
    }

    return {
      path: endpoint.path,
      method,
      status: response.status,
      passed: true,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    if (err instanceof Error && err.name === "AbortError") {
      return {
        path: endpoint.path,
        method,
        status: null,
        passed: false,
        error: `timeout after ${endpoint.timeoutMs}ms`,
        durationMs,
      };
    }
    return {
      path: endpoint.path,
      method,
      status: null,
      passed: false,
      error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runSmokeChecks(
  input: SmokeRunInput & { yamlPath: string; command: "service.smoke.run" | "site.smoke.run" },
): Promise<SmokeRunResult> {
  const { yamlPath, command, url } = input;

  if (!existsSync(yamlPath)) {
    throw new SmokeConfigNotFoundError(yamlPath);
  }

  const content = await readFile(yamlPath, "utf8");
  const parsed = parseYaml(content) as ServiceSmokeYaml | SiteSmokeYaml;

  const targetId = input.service ?? input.site ?? "";
  if (!targetId) {
    throw new Error("[smoke-runner] either service or site must be specified");
  }

  let endpoints: SmokeEndpoint[];
  if (command === "service.smoke.run") {
    const serviceYaml = parsed as ServiceSmokeYaml;
    if (!serviceYaml.services?.[targetId]) {
      throw new SmokeEntryNotFoundError(targetId);
    }
    endpoints = serviceYaml.services[targetId].endpoints;
  } else {
    const siteYaml = parsed as SiteSmokeYaml;
    if (!siteYaml.sites?.[targetId]) {
      throw new SmokeEntryNotFoundError(targetId);
    }
    endpoints = siteYaml.sites[targetId].paths;
  }

  if (!url) {
    throw new Error("[smoke-runner] url is required (pass --url or resolve from registry)");
  }

  const start = Date.now();
  const checks: SmokeCheckResult[] = [];
  for (const endpoint of endpoints) {
    const result = await checkEndpoint(url, endpoint);
    checks.push(result);
  }
  const durationMs = Date.now() - start;

  const allPassed = checks.every((c) => c.passed);

  return {
    command,
    status: allPassed ? "pass" : "fail",
    targetId,
    url,
    checks,
    durationMs,
  };
}

export async function runSmokeChecksOrSkip(
  input: SmokeRunInput & { yamlPath: string; command: "service.smoke.run" | "site.smoke.run" },
): Promise<SmokeRunResult | { status: "skipped"; reason: string }> {
  if (!existsSync(input.yamlPath)) {
    return {
      status: "skipped",
      reason: `smoke configuration file not found at ${input.yamlPath}`,
    };
  }
  return runSmokeChecks(input);
}
