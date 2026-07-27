/*
<MODULE_CONTRACT>
<purpose>
RFC-0565: Kernel module registering DHT workspace commands. All commands are
workspace-scoped and not cacheable (they depend on external network state and
workshop-local files). Commands are added incrementally as they are implemented.
</purpose>
<non-goals>
  <item>Do not implement command handlers — those live in their own files.</item>
  <item>Do not implement DHT routing — that lives in node.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0565: initial implementation — dht module with dht.node.init command.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "../types.ts";

export const dhtModule: KernelModule = {
  name: "dht",
  version: "0.1.0",

  async register(registry) {
    const { runDhtNodeInit } = await import("./init.ts");

    registry.registerCommand({
      name: "dht.node.init",
      description:
        "RFC-0565: initialize DHT configuration. Creates werkstatt.dht.json with " +
        "bind address, bootstrap nodes, replication factor, and timeout parameters. " +
        "Use --bind <host:port> to specify the bind address. Use --bootstrap <host:port> " +
        "to specify a bootstrap node (can be repeated). Use --json for machine-readable output.",
      scope: "workspace",
      cacheable: false,
      reads: ["werkstatt.identity.json"],
      writes: ["werkstatt.dht.json"],
      execute: runDhtNodeInit,
    });
  },
};
