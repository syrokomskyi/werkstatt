/*
<MODULE_CONTRACT>
<purpose>Provides lightweight structured pipeline log events for build-time content helpers.</purpose>
<non-goals>
  <item>Do not persist logs outside the current Node.js process.</item>
  <item>Do not silence actionable warnings or errors.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0254: add structured expected-fallback log transport for build/check paths.</item>
</CHANGE_SUMMARY>
*/

export type PipelineLogSeverity = "debug" | "info" | "notice" | "warning" | "error";

export type PipelineLogKind =
  "progress" | "expected-fallback" | "advisory" | "external-tool" | "diagnostic" | "error";

export interface PipelineLogEvent {
  severity: PipelineLogSeverity;
  kind: PipelineLogKind;
  message: string;
  command?: string;
  pipeline?: string;
  app?: string;
  packageName?: string;
  module?: string;
  file?: string;
  line?: number;
  ruleId?: string;
  dedupeKey?: string;
  count?: number;
  data?: Record<string, unknown>;
}

interface PipelineLogState {
  events: PipelineLogEvent[];
  counts: Map<string, number>;
}

const STATE_KEY = "__gogolPipelineLogState";

function getState(): PipelineLogState {
  const root = globalThis as typeof globalThis & { __gogolPipelineLogState?: PipelineLogState };
  if (!root[STATE_KEY]) {
    root[STATE_KEY] = { events: [], counts: new Map() };
  }
  return root[STATE_KEY];
}

function renderEvent(event: PipelineLogEvent, count: number): string {
  const prefix = event.kind === "expected-fallback" ? "fallback" : event.kind;
  const suffix = count > 1 ? ` (${count} occurrence(s))` : "";
  return `[${event.severity}:${prefix}] ${event.message}${suffix}`;
}

export function emitPipelineLogEvent(event: PipelineLogEvent): void {
  const state = getState();
  const key = event.dedupeKey ?? `${event.kind}:${event.severity}:${event.message}`;
  const count = (state.counts.get(key) ?? 0) + 1;
  state.counts.set(key, count);
  state.events.push({ ...event, count });

  if (event.severity === "debug") return;
  if (event.kind === "expected-fallback" && count > 1) return;

  const rendered = renderEvent(event, count);
  if (event.severity === "error") {
    console.error(rendered);
    return;
  }
  if (event.severity === "warning") {
    console.warn(rendered);
    return;
  }
  console.log(rendered);
}

export function getPipelineLogEvents(): PipelineLogEvent[] {
  return getState().events.map((event) => ({ ...event }));
}
