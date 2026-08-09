/*
<MODULE_CONTRACT>
<purpose>
ADR-0005: In-memory semaphore-based build queue for the Studio Gate MCP server.
Limits concurrent execution of build-triggering tools (mission.validate, which
runs build.prepare + build.check + astro build) to prevent VM resource
exhaustion when multiple sites' missions are built simultaneously on a single
Werkstatt VM. The queue is per-process: one studio-gate process hosts all sites
on the VM, so one queue governs all concurrent builds.
</purpose>
<non-goals>
  <item>Does not persist queue state — in-memory only, lost on process restart.</item>
  <item>Does not prioritize builds — FIFO ordering, no site-based priority.</item>
  <item>Does not offload to other VMs — per-VM queue, no cross-VM balancing (ADR-0005 §Consequences).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0005: initial in-memory build queue (semaphore-based concurrency limiter).</item>
</CHANGE_SUMMARY>
*/

export interface BuildQueueOptions {
  maxConcurrency: number;
}

export interface QueueSlotInfo {
  active: number;
  queued: number;
  maxConcurrency: number;
}

interface QueuedTask {
  execute: () => Promise<void>;
}

export class BuildQueue {
  private readonly maxConcurrency: number;
  private active = 0;
  private readonly waiting: QueuedTask[] = [];

  constructor(options: BuildQueueOptions) {
    if (options.maxConcurrency < 1) {
      throw new Error(`[BuildQueue] maxConcurrency must be >= 1, got ${options.maxConcurrency}`);
    }
    this.maxConcurrency = options.maxConcurrency;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async (): Promise<void> => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          this.active--;
          this.drain();
        }
      };
      this.waiting.push({ execute });
      this.drain();
    });
  }

  getInfo(): QueueSlotInfo {
    return {
      active: this.active,
      queued: this.waiting.length,
      maxConcurrency: this.maxConcurrency,
    };
  }

  private drain(): void {
    while (this.active < this.maxConcurrency && this.waiting.length > 0) {
      const task = this.waiting.shift()!;
      this.active++;
      void task.execute();
    }
  }
}

const DEFAULT_BUILD_CONCURRENCY = 2;

export function resolveBuildConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["STUDIO_GATE_BUILD_CONCURRENCY"];
  if (raw === undefined || raw === "") {
    return DEFAULT_BUILD_CONCURRENCY;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_BUILD_CONCURRENCY;
  }
  return parsed;
}

const BUILD_TRIGGERING_TOOLS = new Set(["mission.validate", "mission.build"]);

export function isBuildTriggeringTool(toolName: string): boolean {
  return BUILD_TRIGGERING_TOOLS.has(toolName);
}
