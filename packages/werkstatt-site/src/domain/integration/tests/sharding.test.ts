/*
<MODULE_CONTRACT>
<purpose>RFC-0179: verify resolveShard is deterministic, distributes across the shared pool, names
resources by the documented scheme, and isolates a dedicated-tier site onto its own queue. These
properties are what registry-free placement and re-sharding safety depend on.</purpose>
<responsibilities>
  <item>Same siteId+region+shardCount ⇒ identical assignment (stable hash).</item>
  <item>shared tier names gogol-int-{region}-shared-{NN}; dedicated names a per-site queue.</item>
  <item>dedup namespace is region-scoped; DLQ/consumer derive from the queue.</item>
</responsibilities>
<non-goals><item>No I/O — resolveShard is pure.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0179: initial sharding test.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { fnv1a, resolveShard } from "../sharding.ts";

test("resolveShard is deterministic for the same inputs", () => {
  const a = resolveShard("warpgogol-com", "eu", { shardCount: 4 });
  const b = resolveShard("warpgogol-com", "eu", { shardCount: 4 });
  expect(a).toEqual(b);
});

test("shared tier names the queue/dlq/consumer by the documented scheme", () => {
  const s = resolveShard("warpgogol-com", "eu", { tier: "shared", shardCount: 4 });
  expect(s.tier).toBe("shared");
  expect(s.queue).toMatch(/^gogol-int-eu-shared-\d{2}$/);
  expect(s.dlq).toBe(`${s.queue}-dlq`);
  expect(s.consumer).toBe(`${s.queue}-consumer`);
  expect(s.dedupNamespace).toBe("gogol-int-dedup-eu");
  expect(s.shardIndex >= 0 && s.shardIndex < 4).toBeTruthy();
});

test("shard index is hash(siteId) mod shardCount", () => {
  const s = resolveShard("acme-gmbh", "eu", { shardCount: 8 });
  expect(s.shardIndex).toBe(fnv1a("acme-gmbh") % 8);
});

test("region pins the dedup namespace and queue prefix", () => {
  const us = resolveShard("acme-gmbh", "us", { shardCount: 4 });
  expect(us.dedupNamespace).toBe("gogol-int-dedup-us");
  expect(us.queue).toMatch(/^gogol-int-us-shared-/);
});

test("dedicated tier isolates a site onto its own queue", () => {
  const d = resolveShard("Busy Client!", "eu", { tier: "dedicated" });
  expect(d.tier).toBe("dedicated");
  expect(d.shardIndex).toBe(-1);
  expect(d.queue).toBe("gogol-int-eu-ded-busy-client");
  expect(d.dlq).toBe("gogol-int-eu-ded-busy-client-dlq");
});

test("the shared pool actually fans out across shards", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i += 1) {
    seen.add(resolveShard(`site-${i}`, "eu", { shardCount: 4 }).shardIndex);
  }
  expect(seen.size).toBe(4);
});

test("resolveShard rejects an empty siteId", () => {
  expect(() => resolveShard("", "eu")).toThrow();
});
