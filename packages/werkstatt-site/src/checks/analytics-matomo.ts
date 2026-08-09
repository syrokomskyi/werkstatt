/*
<MODULE_CONTRACT>
<purpose>RFC-0305 analytics validators for Messkanon, Matomo Binding, proxy, provisioning, smoke, silence, and export readiness.</purpose>
<non-goals>
  <item>Do not call live Matomo APIs; live provisioning/export require operator secrets and future explicit commands.</item>
  <item>Do not parse or mutate app production secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305 Phase 0/1: introduce canonical analytics validators and Matomo proxy readiness checks.</item>
  <item>Architecture review: replace string-scanning forbidden-token checks with structural checks — verify FORWARDED_HEADERS allowlist presence and denylist absence instead of searching for Cookie/Authorization/CF-Connecting-IP strings.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileExists } from "@warpgogol/werkstatt-site/share/fs";
import { parse as parseYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const MESSKANON_PATH = join("packages", "ontology", "analytics", "messkanon.yaml");
const MATOMO_BINDING_PATH = join("packages", "ontology", "analytics", "matomo-binding.yaml");
const MATOMO_FLEET_REGISTRY_PATH = join(
  "packages",
  "ontology",
  "analytics",
  "matomo-fleet.registry.yaml",
);
const MATOMO_SUPPORT_DIR = join(
  "packages",
  "os",
  "site-kernel-checks",
  "src",
  "analytics",
  "matomo",
);
const MATOMO_PROXY_DIR = join("services", "matomo-proxy");

const LOWER_SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SECRET_PATTERNS = [
  /token_auth/i,
  /api[_-]?token/i,
  /authorization/i,
  /bearer\s+[a-z0-9._-]+/i,
  /matomo_cloud_host\s*[:=]\s*https?:/i,
];

type AnyRecord = Record<string, unknown>;

function analyticsResult(command: string, violations: string[]): KernelCommandResult<CheckResult> {
  const diagnostics: Diagnostic[] = violations.map((message) => ({
    ruleId: "ANALYTICS-MATOMO-01",
    severity: "error",
    message,
  }));
  return diagnosticsResult(command, diagnostics);
}

async function readAnalyticsYaml(workspaceRoot: string, relPath: string, violations: string[]) {
  const absPath = join(workspaceRoot, relPath);
  let raw = "";
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    violations.push(`${relPath}: file is missing`);
    return null;
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(raw)) {
      violations.push(`${relPath}: contains a forbidden secret-like token pattern (${pattern})`);
    }
  }

  try {
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      violations.push(`${relPath}: YAML root must be an object`);
      return null;
    }
    return parsed as AnyRecord;
  } catch (error) {
    violations.push(
      `${relPath}: YAML parse error - ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function asRecords(value: unknown): AnyRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is AnyRecord =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function getRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

async function loadMesskanonAndBinding(workspaceRoot: string, violations: string[]) {
  const messkanon = await readAnalyticsYaml(workspaceRoot, MESSKANON_PATH, violations);
  const binding = await readAnalyticsYaml(workspaceRoot, MATOMO_BINDING_PATH, violations);
  return { messkanon, binding };
}

function messkanonEventIds(messkanon: AnyRecord | null): Set<string> {
  return new Set(
    asRecords(messkanon?.["events"]).map((event) => String(event["semanticId"] ?? "")),
  );
}

function goalEligibleIds(messkanon: AnyRecord | null): Set<string> {
  return new Set(
    asRecords(messkanon?.["events"])
      .filter((event) => event["goalEligible"] === true)
      .map((event) => String(event["semanticId"] ?? "")),
  );
}

export async function runAnalyticsMesskanonValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const messkanon = await readAnalyticsYaml(context.workspaceRoot, MESSKANON_PATH, violations);
  if (!messkanon) return analyticsResult("analytics.messkanon.validate", violations);

  if (messkanon["kind"] !== "analytics-messkanon") {
    violations.push(`${MESSKANON_PATH}: kind must be analytics-messkanon`);
  }
  if (typeof messkanon["version"] !== "string" || !messkanon["version"]) {
    violations.push(`${MESSKANON_PATH}: version is required`);
  }

  const meta = getRecord(messkanon["meta"]);
  if (asRecords(meta["changelog"]).length === 0) {
    violations.push(`${MESSKANON_PATH}: meta.changelog must contain at least one entry`);
  }

  const events = asRecords(messkanon["events"]);
  if (events.length === 0) {
    violations.push(`${MESSKANON_PATH}: events[] must not be empty`);
  }

  const seen = new Set<string>();
  const goalKeys = new Set<string>();
  for (const event of events) {
    const semanticId = String(event["semanticId"] ?? "");
    const category = String(event["category"] ?? "");
    const action = String(event["action"] ?? "");
    if (!SEMANTIC_ID.test(semanticId)) {
      violations.push(
        `${MESSKANON_PATH}: event semanticId "${semanticId}" must be dot-separated lower snake_case`,
      );
    }
    if (seen.has(semanticId)) {
      violations.push(`${MESSKANON_PATH}: duplicate event semanticId "${semanticId}"`);
    }
    seen.add(semanticId);
    if (!LOWER_SNAKE.test(category)) {
      violations.push(
        `${MESSKANON_PATH}: event ${semanticId} category "${category}" must be lower snake_case`,
      );
    }
    if (!LOWER_SNAKE.test(action)) {
      violations.push(
        `${MESSKANON_PATH}: event ${semanticId} action "${action}" must be lower snake_case`,
      );
    }
    for (const value of Array.isArray(event["nameValues"]) ? event["nameValues"] : []) {
      if (typeof value !== "string" || !LOWER_SNAKE.test(value)) {
        violations.push(
          `${MESSKANON_PATH}: event ${semanticId} name value "${String(value)}" must be lower snake_case`,
        );
      }
    }
    if (event["goalEligible"] === true) {
      const goalKey = String(event["goalKey"] ?? "");
      if (!LOWER_SNAKE.test(goalKey)) {
        violations.push(
          `${MESSKANON_PATH}: goal-eligible event ${semanticId} needs lower snake_case goalKey`,
        );
      }
      goalKeys.add(goalKey);
    }
    const payloadRaw = JSON.stringify(event["payload"] ?? {});
    if (/\b(email|phone|name|ip|user|visitor|address)\b/i.test(payloadRaw)) {
      violations.push(
        `${MESSKANON_PATH}: event ${semanticId} payload appears to declare PII-like fields`,
      );
    }
  }

  const kpis = asRecords(messkanon["kpis"]);
  if (kpis.length === 0) {
    violations.push(`${MESSKANON_PATH}: kpis[] must not be empty`);
  }
  for (const kpi of kpis) {
    const id = String(kpi["id"] ?? "");
    if (!LOWER_SNAKE.test(id)) {
      violations.push(`${MESSKANON_PATH}: KPI id "${id}" must be lower snake_case`);
    }
    for (const goal of Array.isArray(kpi["goals"]) ? kpi["goals"] : []) {
      if (!goalKeys.has(String(goal))) {
        violations.push(`${MESSKANON_PATH}: KPI ${id} references unknown goal "${String(goal)}"`);
      }
    }
    if (!kpi["source"]) {
      violations.push(`${MESSKANON_PATH}: KPI ${id} must declare source`);
    }
  }

  const dimensions = getRecord(messkanon["dimensions"]);
  for (const scope of ["visit", "action"]) {
    if (asRecords(dimensions[scope]).length === 0) {
      violations.push(`${MESSKANON_PATH}: dimensions.${scope} must contain at least one dimension`);
    }
  }

  return analyticsResult("analytics.messkanon.validate", violations);
}

export async function runAnalyticsBindingValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const { messkanon, binding } = await loadMesskanonAndBinding(context.workspaceRoot, violations);
  if (!messkanon || !binding) return analyticsResult("analytics.binding.validate", violations);

  if (binding["kind"] !== "analytics-matomo-binding") {
    violations.push(`${MATOMO_BINDING_PATH}: kind must be analytics-matomo-binding`);
  }
  if (binding["messkanonVersion"] !== messkanon["version"]) {
    violations.push(
      `${MATOMO_BINDING_PATH}: messkanonVersion must equal ${MESSKANON_PATH} version ${String(messkanon["version"])}`,
    );
  }

  const allEvents = messkanonEventIds(messkanon);
  const goalEvents = goalEligibleIds(messkanon);
  const boundEvents = new Set<string>();
  for (const event of asRecords(binding["events"])) {
    const semanticId = String(event["semanticId"] ?? "");
    boundEvents.add(semanticId);
    if (!allEvents.has(semanticId)) {
      violations.push(
        `${MATOMO_BINDING_PATH}: event binding references unknown semanticId "${semanticId}"`,
      );
    }
    const matomo = getRecord(event["matomo"]);
    for (const field of ["category", "action", "nameFrom"]) {
      if (typeof matomo[field] !== "string" || !matomo[field]) {
        violations.push(`${MATOMO_BINDING_PATH}: event ${semanticId} matomo.${field} is required`);
      }
    }
  }
  for (const id of allEvents) {
    if (!boundEvents.has(id)) {
      violations.push(`${MATOMO_BINDING_PATH}: missing binding for Messkanon event "${id}"`);
    }
  }

  const goals = asRecords(binding["goals"]);
  if (goals.length < 4) {
    violations.push(`${MATOMO_BINDING_PATH}: expected at least four Anfrage goals`);
  }
  for (const goal of goals) {
    const semanticId = String(goal["semanticId"] ?? "");
    if (!goalEvents.has(semanticId)) {
      violations.push(
        `${MATOMO_BINDING_PATH}: goal ${String(goal["key"] ?? "")} references non-goal Messkanon event "${semanticId}"`,
      );
    }
    const match = getRecord(goal["match"]);
    if (match["type"] !== "event" || !match["category"] || !match["action"]) {
      violations.push(
        `${MATOMO_BINDING_PATH}: goal ${String(goal["key"] ?? "")} must match a Matomo event category/action`,
      );
    }
  }

  const dimensions = getRecord(binding["dimensions"]);
  for (const scope of ["visit", "action"]) {
    for (const dimension of asRecords(dimensions[scope])) {
      if (typeof dimension["name"] !== "string" || !LOWER_SNAKE.test(dimension["name"])) {
        violations.push(
          `${MATOMO_BINDING_PATH}: dimensions.${scope} contains invalid name "${String(dimension["name"] ?? "")}"`,
        );
      }
      if (dimension["id"] !== undefined) {
        violations.push(
          `${MATOMO_BINDING_PATH}: dimensions.${scope}.${String(dimension["name"])} must not hardcode id; use fleet registry`,
        );
      }
    }
  }

  const tracker = getRecord(binding["tracker"]);
  if (tracker["proxyPath"] !== "/_wg/analytics/") {
    violations.push(`${MATOMO_BINDING_PATH}: tracker.proxyPath must be /_wg/analytics/`);
  }
  const forbiddenCalls = new Set(
    Array.isArray(tracker["forbiddenQueueCalls"]) ? tracker["forbiddenQueueCalls"].map(String) : [],
  );
  for (const call of [
    "rememberConsentGiven",
    "rememberCookieConsentGiven",
    "enableHeartBeatTimer",
    "setUserId",
  ]) {
    if (!forbiddenCalls.has(call)) {
      violations.push(`${MATOMO_BINDING_PATH}: tracker.forbiddenQueueCalls must include ${call}`);
    }
  }

  return analyticsResult("analytics.binding.validate", violations);
}

async function validateMatomoFleetRegistry(
  workspaceRoot: string,
  violations: string[],
): Promise<void> {
  const registry = await readAnalyticsYaml(workspaceRoot, MATOMO_FLEET_REGISTRY_PATH, violations);
  if (!registry) return;
  if (registry["kind"] !== "analytics-matomo-fleet-registry") {
    violations.push(`${MATOMO_FLEET_REGISTRY_PATH}: kind must be analytics-matomo-fleet-registry`);
  }
  if (registry["schemaVersion"] !== 1) {
    violations.push(`${MATOMO_FLEET_REGISTRY_PATH}: schemaVersion must be 1`);
  }
  const sites = asRecords(registry["sites"]);
  const seen = new Set<string>();
  for (const site of sites) {
    const appId = String(site["appId"] ?? "");
    const clientSemanticId = String(site["clientSemanticId"] ?? "");
    const key = `${appId}:${clientSemanticId}`;
    if (!appId || !clientSemanticId) {
      violations.push(`${MATOMO_FLEET_REGISTRY_PATH}: every site needs appId and clientSemanticId`);
    }
    if (seen.has(key)) {
      violations.push(`${MATOMO_FLEET_REGISTRY_PATH}: duplicate site record ${key}`);
    }
    seen.add(key);
    if (
      !["planned", "provisioned", "active", "paused", "offboarded"].includes(
        String(site["status"] ?? ""),
      )
    ) {
      violations.push(`${MATOMO_FLEET_REGISTRY_PATH}: site ${key} has invalid status`);
    }
    if (site["tokenAuth"] || site["apiToken"] || site["authorization"]) {
      violations.push(
        `${MATOMO_FLEET_REGISTRY_PATH}: site ${key} contains a forbidden secret field`,
      );
    }
  }
}

export async function runMatomoProxyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const proxyDir = join(context.workspaceRoot, MATOMO_PROXY_DIR);
  const serviceConfigPath = join(proxyDir, "service.config.yaml");
  const workerPath = join(proxyDir, "src", "worker.ts");
  const proxyPath = join(proxyDir, "src", "proxy.ts");

  for (const rel of [
    join(MATOMO_PROXY_DIR, "package.json"),
    join(MATOMO_PROXY_DIR, "service.config.yaml"),
    join(MATOMO_PROXY_DIR, "wrangler.jsonc"),
    join(MATOMO_PROXY_DIR, "src", "worker.ts"),
    join(MATOMO_PROXY_DIR, "src", "proxy.ts"),
  ]) {
    if (!(await fileExists(join(context.workspaceRoot, rel)))) {
      violations.push(`${rel}: required Matomo proxy file is missing`);
    }
  }

  if (await fileExists(serviceConfigPath)) {
    const raw = await readFile(serviceConfigPath, "utf8");
    const config = parseYaml(raw) as AnyRecord;
    if (config["kind"] !== "proxy-worker") {
      violations.push(`${MATOMO_PROXY_DIR}/service.config.yaml: kind must be proxy-worker`);
    }
    const routes = Array.isArray(config["routes"]) ? (config["routes"] as string[]) : [];
    const hasAnalyticsRoute = routes.some((r) => r.startsWith("/_wg/analytics/"));
    if (!hasAnalyticsRoute) {
      violations.push(
        `${MATOMO_PROXY_DIR}/service.config.yaml: routes must include a /_wg/analytics/ pattern`,
      );
    }
  }

  for (const filePath of [workerPath, proxyPath]) {
    if (!(await fileExists(filePath))) continue;
    const rel = relative(context.workspaceRoot, filePath).replace(/\\/g, "/");
    const source = await readFile(filePath, "utf8");
    if (source.includes("apps/") || source.includes("apps\\")) {
      violations.push(`${rel}: services must not import from apps/*`);
    }
    if (source.includes("console.log")) {
      violations.push(`${rel}: must not contain console.log`);
    }
  }

  if (await fileExists(proxyPath)) {
    const rel = relative(context.workspaceRoot, proxyPath).replace(/\\/g, "/");
    const source = await readFile(proxyPath, "utf8");
    for (const required of ["matomo.js", "matomo.php", "Cache-Control", "no-store"]) {
      if (!source.includes(required)) {
        violations.push(`${rel}: must mention ${required} for allowlist/cache policy`);
      }
    }
    if (!source.includes("FORWARDED_HEADERS")) {
      violations.push(`${rel}: must use a FORWARDED_HEADERS allowlist for header forwarding`);
    }
    if (source.includes("DROPPED_REQUEST_HEADERS")) {
      violations.push(`${rel}: must not use a denylist-based header filter — use allowlist only`);
    }
  }

  return analyticsResult("matomo.proxy.validate", violations);
}

async function validateSupportFile(
  context: KernelRuntimeContext,
  command: string,
  fileName: string,
  expectedTokens: string[],
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const filePath = join(context.workspaceRoot, MATOMO_SUPPORT_DIR, fileName);
  if (!(await fileExists(filePath))) {
    violations.push(`${MATOMO_SUPPORT_DIR}/${fileName}: required RFC-0305 support file is missing`);
    return analyticsResult(command, violations);
  }
  const source = await readFile(filePath, "utf8");
  for (const token of expectedTokens) {
    if (!source.includes(token)) {
      violations.push(`${MATOMO_SUPPORT_DIR}/${fileName}: must include ${token}`);
    }
  }
  return analyticsResult(command, violations);
}

export function runMatomoProvisionValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return validateSupportFile(context, "matomo.provision.validate", "provisioning.ts", [
    "MatomoFleetSite",
    "buildMatomoProvisioningPlan",
    "anfrage_telefon",
    "clientSemanticId",
  ]).then(async (result) => {
    const violations: string[] = [];
    await validateMatomoFleetRegistry(context.workspaceRoot, violations);
    if (violations.length === 0 && result.exitCode === 0) return result;
    return analyticsResult("matomo.provision.validate", [
      ...((result.data as { diagnostics?: Array<{ message?: string }> })?.diagnostics ?? []).map(
        (d) => String(d.message ?? d),
      ),
      ...violations,
    ]);
  });
}

export function runMatomoSmokeValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return validateSupportFile(context, "matomo.smoke.validate", "smoke.ts", [
    "buildMatomoSmokeRequest",
    "contact.route_click",
    "tokenAuth",
    "fixture",
  ]);
}

export function runMatomoSilenceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return validateSupportFile(context, "matomo.silence.validate", "silence.ts", [
    "MATOMO-SILENCE-01",
    "MATOMO-SILENCE-02",
    "defaultSilenceDays",
    "VisitsSummary.get",
  ]);
}

export function runMatomoExportValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return validateSupportFile(context, "matomo.export.validate", "export.ts", [
    "AnalyticsExportPackage",
    "aggregateReports",
    "rawVisitsWithinRetention",
    "manifestHashes",
  ]);
}

export async function listAnalyticsFiles(workspaceRoot: string): Promise<string[]> {
  const dir = join(workspaceRoot, "packages", "ontology", "analytics");
  try {
    return (await readdir(dir)).map((name) => join("packages", "ontology", "analytics", name));
  } catch {
    return [];
  }
}
