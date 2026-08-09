/*
<MODULE_CONTRACT>
<purpose>
ADR-0005: Tests for the in-memory BuildQueue — concurrency limiting, FIFO
ordering, error propagation, and env var resolution.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0005: initial build queue tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { BuildQueue, resolveBuildConcurrency, isBuildTriggeringTool } from "../build-queue.ts";

describe("BuildQueue", () => {
  it("runs tasks up to maxConcurrency concurrently", async () => {
    const queue = new BuildQueue({ maxConcurrency: 2 });
    let active = 0;
    let maxObserved = 0;

    const makeTask = (delay: number) => async () => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      await new Promise((r) => setTimeout(r, delay));
      active--;
      return "ok";
    };

    const results = await Promise.all([
      queue.run(makeTask(50)),
      queue.run(makeTask(50)),
      queue.run(makeTask(50)),
      queue.run(makeTask(50)),
      queue.run(makeTask(50)),
    ]);

    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(maxObserved).toBe(2);
  });

  it("processes tasks in FIFO order when concurrency is 1", async () => {
    const queue = new BuildQueue({ maxConcurrency: 1 });
    const order: number[] = [];

    const makeTask = (id: number) => async () => {
      order.push(id);
      await new Promise((r) => setTimeout(r, 10));
      return id;
    };

    const results = await Promise.all([
      queue.run(makeTask(1)),
      queue.run(makeTask(2)),
      queue.run(makeTask(3)),
    ]);

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("propagates errors from queued tasks", async () => {
    const queue = new BuildQueue({ maxConcurrency: 2 });

    const goodTask = async () => "success";
    const badTask = async () => {
      throw new Error("build failed");
    };

    const tasks: Promise<string>[] = [queue.run(goodTask), queue.run(badTask), queue.run(goodTask)];
    const settled = await Promise.allSettled(tasks);
    const [r1, r2, r3] = settled;

    expect(r1.status).toBe("fulfilled");
    expect((r1 as PromiseFulfilledResult<string>).value).toBe("success");
    expect(r2.status).toBe("rejected");
    expect((r2 as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect((r2 as PromiseRejectedResult).reason.message).toBe("build failed");
    expect(r3.status).toBe("fulfilled");
    expect((r3 as PromiseFulfilledResult<string>).value).toBe("success");
  });

  it("frees slot after task completes, allowing queued tasks to start", async () => {
    const queue = new BuildQueue({ maxConcurrency: 1 });
    const info1 = queue.getInfo();
    expect(info1).toEqual({ active: 0, queued: 0, maxConcurrency: 1 });

    const p1 = queue.run(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return "first";
    });
    const p2 = queue.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "second";
    });

    await new Promise((r) => setTimeout(r, 5));
    const infoDuring = queue.getInfo();
    expect(infoDuring.active).toBe(1);
    expect(infoDuring.queued).toBe(1);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("first");
    expect(r2).toBe("second");

    const infoAfter = queue.getInfo();
    expect(infoAfter.active).toBe(0);
    expect(infoAfter.queued).toBe(0);
  });

  it("throws on maxConcurrency < 1", () => {
    expect(() => new BuildQueue({ maxConcurrency: 0 })).toThrow();
    expect(() => new BuildQueue({ maxConcurrency: -1 })).toThrow();
  });
});

describe("resolveBuildConcurrency", () => {
  it("returns default when env var is unset", () => {
    expect(resolveBuildConcurrency({})).toBe(2);
  });

  it("returns default when env var is empty", () => {
    expect(resolveBuildConcurrency({ STUDIO_GATE_BUILD_CONCURRENCY: "" })).toBe(2);
  });

  it("returns parsed value when valid", () => {
    expect(resolveBuildConcurrency({ STUDIO_GATE_BUILD_CONCURRENCY: "4" })).toBe(4);
    expect(resolveBuildConcurrency({ STUDIO_GATE_BUILD_CONCURRENCY: "1" })).toBe(1);
  });

  it("returns default when value is invalid", () => {
    expect(resolveBuildConcurrency({ STUDIO_GATE_BUILD_CONCURRENCY: "abc" })).toBe(2);
    expect(resolveBuildConcurrency({ STUDIO_GATE_BUILD_CONCURRENCY: "0" })).toBe(2);
    expect(resolveBuildConcurrency({ STUDIO_GATE_BUILD_CONCURRENCY: "-1" })).toBe(2);
  });
});

describe("isBuildTriggeringTool", () => {
  it("returns true for mission.validate", () => {
    expect(isBuildTriggeringTool("mission.validate")).toBe(true);
  });

  it("returns true for mission.build", () => {
    expect(isBuildTriggeringTool("mission.build")).toBe(true);
  });

  it("returns false for non-build tools", () => {
    expect(isBuildTriggeringTool("workpiece.read")).toBe(false);
    expect(isBuildTriggeringTool("workpiece.write")).toBe(false);
    expect(isBuildTriggeringTool("mission.open")).toBe(false);
    expect(isBuildTriggeringTool("mission.close")).toBe(false);
  });
});
