/*
<MODULE_CONTRACT>
<purpose>
RFC-0214: the shared Truth Monitor. One platform process (not per-site) driven by a
`monitor_sources` registry: enable/disable/status lifecycle (mirrors Lagebild
RFC-0186) + source.monitor.run, which fetches each ENABLED source, extracts the
observed value, compares it to every bound claim's asserted value, and writes
DivergenceRecords to the outbox. Disabled by default — no source is fetched until
explicitly enabled. The monitor never mutates content; it reports.
</purpose>
<non-goals>
  <item>Do not edit content on divergence — only write outbox records (CKL-SRC-03 surfaces them).</item>
  <item>Do not create per-site workers — one shared registry + outbox.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0214: initial shared Truth Monitor commands.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { recordClaimsSchema } from "@gogol/share/schemas";
import { resolveFieldPath } from "@gogol/share/content/resolve-field-path";
import {
  compareValues,
  extractJsonPath,
  type DivergenceRecord,
  type SourceDescriptor,
} from "@gogol/share/knowledge/source";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { pathExists, readMarkdownDocument } from "./content-discipline.ts";
import { collectClaimSidecars, recordPathForSidecar, toPosix } from "./content-claims.ts";
import {
  MONITOR_REGISTRY_FILE,
  OUTBOX_FILE,
  loadSourceDescriptors,
} from "./content-source-binding.ts";

interface MonitorEntry {
  id: string;
  enabled: boolean;
  addedAt: string;
}
interface MonitorRegistry {
  sources: MonitorEntry[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readRegistry(workspaceRoot: string): Promise<MonitorRegistry> {
  const file = join(workspaceRoot, MONITOR_REGISTRY_FILE);
  if (!(await pathExists(file))) return { sources: [] };
  try {
    const data = parseYaml(await readFile(file, "utf-8"));
    return data && Array.isArray(data.sources) ? data : { sources: [] };
  } catch {
    return { sources: [] };
  }
}

async function writeRegistry(workspaceRoot: string, reg: MonitorRegistry): Promise<void> {
  const file = join(workspaceRoot, MONITOR_REGISTRY_FILE);
  await mkdir(dirname(file), { recursive: true });
  reg.sources.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(file, `${yamlStringify(reg)}`, "utf-8");
}

function sourceFlag(input: KernelCommandInput): string | undefined {
  return (input.flags["source"] as string | undefined) ?? (input.args[0] as string | undefined);
}

export async function runSourceMonitorTenantAdd(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "source.monitor.tenant.add";
  const id = sourceFlag(input);
  if (!id) return failResult(command, ["--source <descriptor-id> is required"]);
  const { byId } = await loadSourceDescriptors(context.workspaceRoot);
  if (!byId.has(id)) {
    return failResult(command, [
      `No descriptor "${id}" in integrations/truth-sources/. Add it first.`,
    ]);
  }
  const reg = await readRegistry(context.workspaceRoot);
  if (reg.sources.some((s) => s.id === id)) {
    return passResult(command, `${id} already registered`);
  }
  reg.sources.push({ id, enabled: false, addedAt: today() });
  await writeRegistry(context.workspaceRoot, reg);
  context.logger.success(`Registered ${id} (disabled). Enable with source.monitor.tenant.enable.`);
  return passResult(command, `registered ${id}`);
}

async function setEnabled(
  command: string,
  input: KernelCommandInput,
  context: KernelRuntimeContext,
  enabled: boolean,
): Promise<KernelCommandResult<CheckResult>> {
  const id = sourceFlag(input);
  if (!id) return failResult(command, ["--source <descriptor-id> is required"]);
  const reg = await readRegistry(context.workspaceRoot);
  const entry = reg.sources.find((s) => s.id === id);
  if (!entry)
    return failResult(command, [`${id} is not registered (source.monitor.tenant.add first)`]);
  entry.enabled = enabled;
  await writeRegistry(context.workspaceRoot, reg);
  context.logger.success(`${id} ${enabled ? "enabled" : "disabled"}`);
  return passResult(command, `${id} ${enabled ? "enabled" : "disabled"}`);
}

export const runSourceMonitorTenantEnable = (i: KernelCommandInput, c: KernelRuntimeContext) =>
  setEnabled("source.monitor.tenant.enable", i, c, true);
export const runSourceMonitorTenantDisable = (i: KernelCommandInput, c: KernelRuntimeContext) =>
  setEnabled("source.monitor.tenant.disable", i, c, false);

export async function runSourceMonitorStatus(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "source.monitor.status";
  const reg = await readRegistry(context.workspaceRoot);
  const { byId } = await loadSourceDescriptors(context.workspaceRoot);
  if (context.outputFormat === "pretty") {
    context.logger.section("source.monitor.status");
    if (reg.sources.length === 0) context.logger.info("No monitored sources registered.");
    for (const s of reg.sources) {
      const known = byId.has(s.id) ? "" : " (descriptor MISSING)";
      context.logger.info(`  ${s.enabled ? "enabled " : "disabled"}  ${s.id}${known}`);
    }
  }
  return passResult(
    command,
    `${reg.sources.filter((s) => s.enabled).length} enabled / ${reg.sources.length} registered`,
  );
}

/** All claim sidecars across all apps → { app, sidecarPath }. */
async function allAppSidecars(
  workspaceRoot: string,
): Promise<Array<{ app: string; sidecar: string }>> {
  const appsDir = join(workspaceRoot, "apps");
  const out: Array<{ app: string; sidecar: string }> = [];
  if (!(await pathExists(appsDir))) return out;
  for (const entry of await readdir(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const businessDir = join(appsDir, entry.name, "src", "content", "business");
    for (const sidecar of await collectClaimSidecars(businessDir)) {
      out.push({ app: entry.name, sidecar });
    }
  }
  return out;
}

async function fetchObserved(
  descriptor: SourceDescriptor,
): Promise<{ value?: unknown; unreachable: boolean }> {
  if (descriptor.kind === "manual") return { unreachable: false }; // no endpoint — review-cadence only.
  if (descriptor.kind === "http-html-selector") return { unreachable: true }; // DOM extraction is worker-only.
  if (!descriptor.endpoint) return { unreachable: true };
  try {
    const res = await fetch(descriptor.endpoint, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { unreachable: true };
    const payload = await res.json();
    return {
      value: descriptor.extract ? extractJsonPath(payload, descriptor.extract) : payload,
      unreachable: false,
    };
  } catch {
    return { unreachable: true };
  }
}

export async function runSourceMonitorRun(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "source.monitor.run";
  const reg = await readRegistry(context.workspaceRoot);
  const { byId } = await loadSourceDescriptors(context.workspaceRoot);
  const enabled = reg.sources.filter((s) => s.enabled && byId.has(s.id));

  const divergences: DivergenceRecord[] = [];
  const sidecars = await allAppSidecars(context.workspaceRoot);

  for (const entry of enabled) {
    const descriptor = byId.get(entry.id)!;
    if (descriptor.kind === "manual") continue; // manual sources carry no observed value.
    const observed = await fetchObserved(descriptor);

    for (const { app, sidecar } of sidecars) {
      const raw = await readFile(sidecar, "utf-8");
      const parsed = recordClaimsSchema.safeParse(parseYaml(raw));
      if (!parsed.success) continue;
      const relFile = toPosix(context.workspaceRoot, sidecar);
      const record = await readMarkdownDocument(
        context.workspaceRoot,
        recordPathForSidecar(sidecar),
      ).catch(() => null);
      if (!record) continue;

      for (const [fieldPath, ann] of Object.entries(parsed.data)) {
        if (ann.sourceRef !== entry.id) continue;
        const stem = relFile
          .replace(/^apps\/[^/]+\/src\/content\//, "")
          .replace(/\.claims\.yaml$/, "");
        const subject = `${stem}#${fieldPath}`;
        const asserted = resolveFieldPath(record.frontmatter, fieldPath.split(".")).value;
        if (observed.unreachable) {
          divergences.push({
            sourceId: entry.id,
            subject,
            app,
            assertedValue: String(asserted ?? ""),
            observedValue: "",
            withinTolerance: true,
            observedAt: today(),
            unreachable: true,
          });
          continue;
        }
        const cmp = compareValues(
          asserted,
          observed.value,
          descriptor.expectedType,
          descriptor.tolerance,
        );
        divergences.push({
          sourceId: entry.id,
          subject,
          app,
          assertedValue: cmp.assertedStr,
          observedValue: cmp.observedStr,
          withinTolerance: cmp.withinTolerance,
          observedAt: today(),
        });
      }
    }
  }

  const outFile = join(context.workspaceRoot, OUTBOX_FILE);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${yamlStringify(divergences)}`, "utf-8");

  const diverged = divergences.filter((d) => !d.unreachable && !d.withinTolerance).length;
  context.logger.info(
    `source.monitor.run: ${enabled.length} enabled source(s), ${divergences.length} check(s), ${diverged} divergence(s)`,
  );
  return passResult(command, `${diverged} divergence(s) across ${enabled.length} source(s)`);
}
